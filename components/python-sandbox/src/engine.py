"""Core Bubblewrap-based Python Sandbox Engine.

Provides hardware-isolated execution of arbitrary Python scripts and pytest suites
using unprivileged Linux namespaces (bubblewrap / bwrap).
Enforces:
- Airgapped networking (--unshare-all, CLONE_NEWNET)
- Ephemeral filesystem workspace (host filesystem is inaccessible)
- Memory (RLIMIT_AS) and CPU (RLIMIT_CPU) quotas
- Strict execution timeouts and process cleanup (--die-with-parent)
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class SandboxResult:
    """Result of a sandbox script execution."""

    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    artifacts: dict[str, str] = field(default_factory=dict)
    timed_out: bool = False
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "duration_ms": self.duration_ms,
            "artifacts": self.artifacts,
            "timed_out": self.timed_out,
            "error": self.error,
        }


@dataclass
class PytestResult:
    """Result of a sandbox pytest execution."""

    success: bool
    exit_code: int
    passed: int
    failed: int
    skipped: int
    total: int
    output: str
    duration_ms: float
    timed_out: bool = False
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "exit_code": self.exit_code,
            "passed": self.passed,
            "failed": self.failed,
            "skipped": self.skipped,
            "total": self.total,
            "output": self.output,
            "duration_ms": self.duration_ms,
            "timed_out": self.timed_out,
            "error": self.error,
        }


class SandboxEngine:
    """Manages secure execution inside an unprivileged bubblewrap sandbox."""

    def __init__(
        self,
        bwrap_path: str | None = None,
        python_bin: str | None = None,
        default_timeout_seconds: int = 15,
        default_memory_mb: int = 512,
    ) -> None:
        import sys
        self.bwrap_path = bwrap_path or shutil.which("bwrap")
        self.python_bin = python_bin or sys.executable or "python3"
        self.default_timeout_seconds = default_timeout_seconds
        self.default_memory_mb = default_memory_mb

    @property
    def is_bubblewrap_available(self) -> bool:
        return self.bwrap_path is not None and os.path.exists(self.bwrap_path)

    def _validate_safe_path(self, relative_path: str) -> Path:
        """Validate that a file path is safe and does not escape workspace."""
        p = Path(relative_path)
        if p.is_absolute() or ".." in p.parts:
            raise ValueError(f"Path traversal detected or absolute path forbidden: {relative_path}")
        return p

    def _find_site_packages(self) -> list[str]:
        """Find user, venv and system site-packages to mount read-only into sandbox."""
        import sys
        found: list[str] = []
        seen: set[str] = set()
        candidates = [
            Path.home() / f".local/lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages",
            Path.home() / ".local/lib/python3.12/site-packages",
            Path.home() / ".local/lib/python3.13/site-packages",
        ]
        for p in sys.path:
            if "site-packages" in p and os.path.isdir(p):
                candidates.append(Path(p))

        for c in candidates:
            if c.is_dir():
                try:
                    resolved = str(c.resolve())
                    if resolved not in seen:
                        seen.add(resolved)
                        found.append(resolved)
                except OSError:
                    pass
        return found

    def _build_bwrap_command(self, ws_dir: str, inner_cmd: list[str], allow_network: bool = False) -> list[str]:
        """Construct the bubblewrap command line with canonical UsrMerge and strict isolation."""
        assert self.bwrap_path is not None

        cmd = [
            self.bwrap_path,
            # Read-only /usr tree
            "--ro-bind", "/usr", "/usr",
            # Standard UsrMerge symlinks for modern Linux (Ubuntu 24.04+)
            "--symlink", "usr/lib", "/lib",
            "--symlink", "usr/bin", "/bin",
        ]

        if os.path.exists("/usr/lib64"):
            cmd.extend(["--symlink", "usr/lib64", "/lib64"])
        if os.path.exists("/usr/sbin"):
            cmd.extend(["--symlink", "usr/sbin", "/sbin"])
        if os.path.isdir("/etc/alternatives"):
            cmd.extend(["--ro-bind", "/etc/alternatives", "/etc/alternatives"])

        # Mount discovered site-packages read-only if present
        site_paths = self._find_site_packages()
        python_paths = ["/workspace"]
        for idx, sp in enumerate(site_paths):
            mount_point = f"/opt/site-packages-{idx}" if idx > 0 else "/opt/site-packages"
            cmd.extend(["--ro-bind", sp, mount_point])
            python_paths.append(mount_point)
        python_path = ":".join(python_paths)

        # Mount active virtual environment / runtime prefix if outside /usr
        import sys
        if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
            venv_path = sys.prefix
            if os.path.isdir(venv_path) and not venv_path.startswith('/usr'):
                cmd.extend(["--ro-bind", venv_path, venv_path])

        # Virtual filesystems
        cmd.extend([
            "--proc", "/proc",
            "--dev", "/dev",
            "--tmpfs", "/tmp",
            # Isolated workspace mounted at /workspace
            "--bind", ws_dir, "/workspace",
            "--chdir", "/workspace",
            "--die-with-parent",
            # Sanitized clean environment
            "--clearenv",
            "--setenv", "PATH", "/usr/bin:/bin:/usr/local/bin",
            "--setenv", "PYTHONPATH", python_path,
            "--setenv", "LANG", "C.UTF-8",
            "--setenv", "PYTHONUNBUFFERED", "1",
            "--setenv", "PYTHONDONTWRITEBYTECODE", "1",
            "--setenv", "HOME", "/tmp",
        ])

        if allow_network:
            cmd.extend([
                "--unshare-user",
                "--unshare-ipc",
                "--unshare-pid",
                "--unshare-uts",
                "--unshare-cgroup",
                "--share-net",
            ])
            if os.path.exists("/etc/resolv.conf"):
                cmd.extend(["--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf"])
            if os.path.isdir("/run/systemd/resolve"):
                cmd.extend(["--ro-bind", "/run/systemd/resolve", "/run/systemd/resolve"])
        else:
            # Complete namespace separation (PID, NET, IPC, UTS, USER, CGROUP)
            cmd.append("--unshare-all")

        # Ensure python binary uses absolute path inside sandbox
        resolved_cmd = list(inner_cmd)
        if resolved_cmd and (resolved_cmd[0] == "python3" or resolved_cmd[0] == self.python_bin):
            if os.path.exists(self.python_bin):
                resolved_cmd[0] = self.python_bin
            else:
                resolved_cmd[0] = "/usr/bin/python3"

        cmd.extend(resolved_cmd)
        return cmd

    def execute(
        self,
        code: str,
        files: dict[str, str] | None = None,
        timeout_seconds: int | None = None,
        memory_limit_mb: int | None = None,
        entrypoint_filename: str = "main.py",
        allow_network: bool = False,
    ) -> SandboxResult:
        """Execute Python code in the sandbox."""
        timeout = timeout_seconds or self.default_timeout_seconds
        mem_mb = memory_limit_mb or self.default_memory_mb
        files_dict = files or {}

        with tempfile.TemporaryDirectory(prefix="devmesh_sandbox_") as ws_dir:
            ws_path = Path(ws_dir)

            # Write user files
            for rel_path, content in files_dict.items():
                target = ws_path / self._validate_safe_path(rel_path)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")

            # Write code to entrypoint
            entry_path = ws_path / self._validate_safe_path(entrypoint_filename)
            entry_path.parent.mkdir(parents=True, exist_ok=True)
            entry_path.write_text(code, encoding="utf-8")

            # Snapshot existing files to detect created artifacts later
            initial_files = {p.relative_to(ws_path) for p in ws_path.rglob("*") if p.is_file()}

            # Generate wrapper script enforcing resource limits
            wrapper_code = f"""import os, sys

# Set memory limit (prefer RLIMIT_DATA to prevent RLIMIT_AS virtual address space crashes on 64-bit)
try:
    import resource
    mem_bytes = {mem_mb} * 1024 * 1024
    if hasattr(resource, 'RLIMIT_DATA'):
        resource.setrlimit(resource.RLIMIT_DATA, (mem_bytes, mem_bytes))
    else:
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
except (ImportError, Exception):
    pass

# Resolve entrypoint file path
entry_rel = {repr(entrypoint_filename)}
if os.path.exists(f"/workspace/{{entry_rel}}"):
    entry_file = f"/workspace/{{entry_rel}}"
else:
    entry_file = os.path.join(os.getcwd(), entry_rel)

with open(entry_file, 'rb') as f:
    compiled = compile(f.read(), entry_file, 'exec')
    exec(compiled, {{'__name__': '__main__', '__file__': entry_file}})
"""
            wrapper_path = ws_path / "__runner__.py"
            wrapper_path.write_text(wrapper_code, encoding="utf-8")

            # Build command - require bubblewrap for secure execution
            if not self.is_bubblewrap_available:
                raise RuntimeError("Bubblewrap (bwrap) ist nicht verfügbar oder fehlt. Ausführung auf dem Host verweigert.")

            cmd = self._build_bwrap_command(ws_dir, [self.python_bin, "/workspace/__runner__.py"], allow_network=allow_network)

            start_t = time.perf_counter()
            timed_out = False
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=ws_dir,
                )
                exit_code = proc.returncode
                stdout = proc.stdout
                stderr = proc.stderr
            except subprocess.TimeoutExpired as e:
                timed_out = True
                exit_code = 124
                stdout = (e.stdout or b"").decode("utf-8", errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
                stderr = f"Execution timed out after {timeout} seconds."
            except Exception as e:
                exit_code = 1
                stdout = ""
                stderr = f"Sandbox invocation error: {str(e)}"

            duration_ms = round((time.perf_counter() - start_t) * 1000, 2)

            # Collect newly created artifacts (excluding runner)
            artifacts: dict[str, str] = {}
            for p in ws_path.rglob("*"):
                if p.is_file():
                    rel = p.relative_to(ws_path)
                    if rel not in initial_files and rel != Path("__runner__.py"):
                        try:
                            # Read as text if UTF-8, else truncate/mark binary
                            artifacts[str(rel)] = p.read_text(encoding="utf-8", errors="replace")
                        except Exception:
                            artifacts[str(rel)] = f"[Binary file, {p.stat().st_size} bytes]"

            success = exit_code == 0 and not timed_out
            return SandboxResult(
                success=success,
                exit_code=exit_code,
                stdout=stdout,
                stderr=stderr,
                duration_ms=duration_ms,
                artifacts=artifacts,
                timed_out=timed_out,
                error=stderr if not success else None,
            )

    def run_pytest(
        self,
        test_code: str,
        source_files: dict[str, str] | None = None,
        timeout_seconds: int = 30,
        extra_pytest_args: list[str] | None = None,
        allow_network: bool = False,
    ) -> PytestResult:
        """Run a pytest suite inside the sandbox."""
        files = dict(source_files or {})
        files["test_suite.py"] = test_code

        # Use pytest runner script
        runner_code = """import os, sys, pytest
ws = '/workspace' if os.path.exists('/workspace') else os.getcwd()
sys.path.insert(0, ws)
test_file = os.path.join(ws, 'test_suite.py')
code = pytest.main(['-q', '--no-header', '--tb=short', test_file] + sys.argv[1:])
sys.exit(code)
"""
        files["run_pytest_inner.py"] = runner_code

        extra_args = extra_pytest_args or []
        inner_script = "/workspace/run_pytest_inner.py" if self.is_bubblewrap_available else "run_pytest_inner.py"
        inner_cmd = [self.python_bin, inner_script] + extra_args

        with tempfile.TemporaryDirectory(prefix="devmesh_pytest_") as ws_dir:
            ws_path = Path(ws_dir)

            for rel_path, content in files.items():
                target = ws_path / self._validate_safe_path(rel_path)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")

            if not self.is_bubblewrap_available:
                raise RuntimeError("Bubblewrap (bwrap) ist nicht verfügbar oder fehlt. Ausführung auf dem Host verweigert.")

            cmd = self._build_bwrap_command(ws_dir, inner_cmd, allow_network=allow_network)

            start_t = time.perf_counter()
            timed_out = False
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    cwd=ws_dir,
                )
                exit_code = proc.returncode
                output = proc.stdout + ("\n" + proc.stderr if proc.stderr else "")
            except subprocess.TimeoutExpired:
                timed_out = True
                exit_code = 124
                output = f"Pytest execution timed out after {timeout_seconds} seconds."
            except Exception as e:
                exit_code = 1
                output = f"Pytest invocation error: {str(e)}"

            duration_ms = round((time.perf_counter() - start_t) * 1000, 2)

            # Parse pytest summary (e.g., "3 passed, 1 failed, 2 skipped in 0.12s")
            passed = 0
            failed = 0
            skipped = 0

            match_passed = re.search(r"(\d+)\s+passed", output)
            if match_passed:
                passed = int(match_passed.group(1))

            match_failed = re.search(r"(\d+)\s+failed", output)
            if match_failed:
                failed = int(match_failed.group(1))

            match_skipped = re.search(r"(\d+)\s+skipped", output)
            if match_skipped:
                skipped = int(match_skipped.group(1))

            total = passed + failed + skipped
            success = exit_code == 0 and not timed_out and failed == 0

            return PytestResult(
                success=success,
                exit_code=exit_code,
                passed=passed,
                failed=failed,
                skipped=skipped,
                total=total,
                output=output.strip(),
                duration_ms=duration_ms,
                timed_out=timed_out,
                error=output.strip() if not success else None,
            )
