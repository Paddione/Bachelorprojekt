"""tests/py/conftest.py — Global pytest fixtures for Bachelorprojekt test suites."""
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import pytest
import yaml


def pytest_configure(config):
    # Tests assert on plain command output; a developer shell's FORCE_COLOR adds ANSI codes.
    os.environ.pop("FORCE_COLOR", None)
    config.addinivalue_line(
        "markers",
        "repo_lock(name): serialize tests sharing a fixed path in the repo across xdist workers",
    )


# Live-environment tests (ported from tests/local/*.bats) need a cluster; only
# tests/runner.sh local opts in via PYTEST_LOCAL=1. [T901392]
collect_ignore = [] if os.environ.get("PYTEST_LOCAL") == "1" else ["local"]


def pytest_collection_modifyitems(config, items):
    """Keep only this shard's modules when SPEC_SHARD/SPEC_SHARDS are set (CI matrix)."""
    shards = int(os.environ.get("SPEC_SHARDS", "1") or "1")
    if shards <= 1:
        return
    import zlib

    shard = int(os.environ["SPEC_SHARD"])
    keep, drop = [], []
    for item in items:
        module = item.nodeid.split("::", 1)[0]
        (keep if zlib.crc32(module.encode()) % shards == shard - 1 else drop).append(item)
    if drop:
        config.hook.pytest_deselected(items=drop)
        items[:] = keep


@pytest.fixture(autouse=True)
def _repo_lock(request):
    """Hold an exclusive file lock for tests marked repo_lock(name)."""
    marker = request.node.get_closest_marker("repo_lock")
    # A nested pytest started by a lock holder inherits the lock instead of deadlocking.
    held_env = "PYTEST_REPO_LOCK_HELD"
    if marker is None or os.environ.get(held_env) == marker.args[0]:
        yield
        return
    import fcntl
    import tempfile

    lock_dir = Path(tempfile.gettempdir()) / "pytest-repo-locks"
    lock_dir.mkdir(exist_ok=True)
    with open(lock_dir / f"{marker.args[0]}.lock", "w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        os.environ[held_env] = marker.args[0]
        try:
            yield
        finally:
            os.environ.pop(held_env, None)


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """Return the absolute path to the repository root directory."""
    return Path(__file__).resolve().parents[2]


class CommandResult:
    """Structured result of a CLI / subprocess command execution."""

    def __init__(self, completed: subprocess.CompletedProcess[str]):
        self.completed = completed
        self.returncode = completed.returncode
        self.stdout = completed.stdout
        self.stderr = completed.stderr

    @property
    def output(self) -> str:
        """Combined stdout and stderr if both present, else stdout."""
        if self.stderr:
            return f"{self.stdout}\n{self.stderr}".strip()
        return self.stdout.strip()

    def check(self, expected_code: int = 0) -> None:
        """Assert that the exit code matches expected_code."""
        assert self.returncode == expected_code, (
            f"Command failed with exit code {self.returncode} (expected {expected_code}):\n"
            f"Command: {self.completed.args}\n"
            f"STDOUT:\n{self.stdout}\n"
            f"STDERR:\n{self.stderr}"
        )


@pytest.fixture
def run_cmd(repo_root: Path):
    """Fixture providing a helper to execute shell commands reliably."""

    def _run(
        cmd: Union[str, List[str]],
        cwd: Optional[Union[str, Path]] = None,
        env: Optional[Dict[str, str]] = None,
        timeout: int = 60,
        shell: Optional[bool] = None,
    ) -> CommandResult:
        work_dir = Path(cwd) if cwd else repo_root
        cmd_env = os.environ.copy()
        if env:
            cmd_env.update(env)

        if shell is None:
            shell = isinstance(cmd, str)

        completed = subprocess.run(
            cmd,
            cwd=str(work_dir),
            env=cmd_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            shell=shell,
        )
        return CommandResult(completed)

    return _run


@pytest.fixture
def yaml_load():
    """Fixture providing a safe YAML loader helper (supports single and multi-doc)."""

    def _load(source: Union[str, Path], all_docs: bool = False) -> Any:
        content = (
            Path(source).read_text(encoding="utf-8")
            if isinstance(source, Path)
            or (
                isinstance(source, str)
                and "\n" not in source
                and os.path.exists(source)
            )
            else str(source)
        )
        docs = [d for d in yaml.safe_load_all(content) if d is not None]
        if all_docs:
            return docs
        if len(docs) == 1:
            return docs[0]
        return docs

    return _load
