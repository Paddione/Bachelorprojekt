"""Runner port-forward diagnostics for task website:migrate (T901789).

Run 38070460176 (post-merge, ENV=mentolder, context=fleet): rollout status OK,
then `kubectl port-forward svc/shared-db :5432` died within ~11 ms with an
EMPTY log, and the fail-closed guard from T901750 exited 1 with zero
actionable diagnostics (no exit code, no kubectl version, no target
resolution). Every post-merge since #6504 fails the same way.

Check mode: output verification (T002448-M4). The tests execute the REAL task
(`task --silent website:migrate ENV=mentolder`) with hermetic kubectl/pnpm
stubs on PATH. The kubectl stub replays the runner incident: rollout and
get-secret succeed, port-forward exits instantly with empty output.
KUBECONFIG points at a nonexistent file so that a stub bypass fails closed
before touching any cluster. `--silent` suppresses the task command echo so
assertions only see real script output, never the rendered source.
"""

import base64
import os
import shutil
import stat

import pytest


def _write_stubs(tmp_path):
    """Create hermetic kubectl/pnpm stubs; return (bin_dir, call_log, marker)."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    call_log = tmp_path / "calls.log"
    marker = tmp_path / "pnpm-marker"
    secret_b64 = base64.b64encode(b"fakepw-t901789").decode("ascii")

    kubectl = bin_dir / "kubectl"
    kubectl.write_text(
        "#!/usr/bin/env bash\n"
        'echo "stub-kubectl: $*" >> "$CALL_LOG"\n'
        'case "$*" in\n'
        '  *"rollout status"*) echo \'deployment "shared-db" successfully rolled out\'; exit 0;;\n'
        '  *"get secret"*) printf \'%s\' "$SECRET_B64"; exit 0;;\n'
        '  *"port-forward"*) exit 1;;\n'
        "  *) exit 0;;\n"
        "esac\n"
    )
    pnpm = bin_dir / "pnpm"
    pnpm.write_text(
        "#!/usr/bin/env bash\n"
        'echo "stub-pnpm: $*" >> "$CALL_LOG"\n'
        'touch "$PNPM_MARKER"\n'
        "exit 0\n"
    )
    for stub in (kubectl, pnpm):
        stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    env = {
        "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
        "KUBECONFIG": str(tmp_path / "no-such-kubeconfig"),
        "CALL_LOG": str(call_log),
        "SECRET_B64": secret_b64,
        "PNPM_MARKER": str(marker),
    }
    return env, call_log, marker


def _run_migrate(run_cmd, repo_root, env):
    return run_cmd(
        ["task", "--silent", "-d", str(repo_root), "website:migrate", "ENV=mentolder"],
        env=env,
        timeout=120,
    )


def test_portforward_death_reports_actionable_diagnostics(run_cmd, repo_root, tmp_path):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    env, call_log, _marker = _write_stubs(tmp_path)
    result = _run_migrate(run_cmd, repo_root, env)
    # The stub replays the runner incident, so the task still fails ...
    assert result.returncode != 0
    # ... at the port-forward stage. Positive anchors (all true today): they
    # prove the run reached the failing stage instead of dying earlier, which
    # keeps the RED assertions below from passing vacuously.
    assert "Migrate target: context=fleet namespace=workspace" in result.output
    assert "port-forward exited unexpectedly" in result.output
    assert "port-forward" in call_log.read_text()
    # RED (T901789): the failure must name the forward's exit code ...
    assert "exit code" in result.output
    # ... and the kubectl client version that produced it.
    assert "kubectl" in result.output
    assert "version" in result.output


def test_failed_forward_never_runs_migration(run_cmd, repo_root, tmp_path):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    env, call_log, marker = _write_stubs(tmp_path)
    result = _run_migrate(run_cmd, repo_root, env)
    assert result.returncode != 0
    # Positive anchors in the same test (T002356-M1): the forward was
    # attempted and died, so "migration never ran" is meaningful.
    assert "port-forward" in call_log.read_text()
    assert "port-forward exited unexpectedly" in result.output
    # Fail-closed (T901750) must survive the diagnostics hardening: the pnpm
    # stub touches its marker on ANY invocation, so absence proves db:migrate
    # was never attempted against the dead forward.
    assert not marker.exists()
