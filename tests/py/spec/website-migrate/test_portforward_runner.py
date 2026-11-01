"""Runner port-forward diagnostics for task website:migrate (T901789).

Run 38070460176 (post-merge, ENV=mentolder, context=fleet): rollout status OK,
then the task reported `port-forward exited unexpectedly` within ~11 ms with
an EMPTY log. Root cause (Befund): the `kill -0 $PF` liveness check from
T901750 can never work under go-task — `$!` expands to a job id ("g1"), kill
and jobs are unsupported — so the HEALTHY forward was declared dead before
kubectl could print anything. Every manifest-merge since #6504 fails this way.

Check mode: output verification (T002448-M4). The tests execute the REAL task
(`task --silent website:migrate ENV=mentolder`) with hermetic kubectl/pnpm
stubs on PATH. Fatal-mode stub replays a REALISTIC kubectl failure (stderr
error + instant exit — real kubectl failures are never silent); healthy-mode
stub replays a forward that comes up. KUBECONFIG points at a nonexistent file
so that a stub bypass fails closed before touching any cluster. `--silent`
suppresses the task command echo so assertions only see real script output,
never the rendered source.
"""

import base64
import contextlib
import os
import shutil
import socket
import stat
import threading

import pytest


def _write_stubs(tmp_path, port_forward_mode="fatal"):
    """Create hermetic kubectl/pnpm stubs; return (env, call_log, marker).

    port_forward_mode: "fatal" replays a realistic kubectl fatal failure
    (stderr error + instant exit); "healthy:<port>" prints a Forwarding line
    for <port> and stays alive briefly (task exit-waits for it, hence short).
    """
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    call_log = tmp_path / "calls.log"
    marker = tmp_path / "pnpm-marker"
    secret_b64 = base64.b64encode(b"fakepw-t901789").decode("ascii")

    if port_forward_mode == "fatal":
        pf_case = (
            '  *"port-forward"*)'
            " echo 'error: unable to forward port: simulated failure (T901789)' >&2;"
            " exit 1;;\n"
        )
    else:
        port = port_forward_mode.split(":", 1)[1]
        pf_case = (
            '  *"port-forward"*)'
            f" echo 'Forwarding from 127.0.0.1:{port} -> 5432';"
            " sleep 8;;\n"
        )

    kubectl = bin_dir / "kubectl"
    kubectl.write_text(
        "#!/usr/bin/env bash\n"
        'echo "stub-kubectl: $*" >> "$CALL_LOG"\n'
        'case "$*" in\n'
        '  *"rollout status"*) echo \'deployment "shared-db" successfully rolled out\'; exit 0;;\n'
        '  *"get secret"*) printf \'%s\' "$SECRET_B64"; exit 0;;\n'
        f"{pf_case}"
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
        ["task", "--silent", "-d", str(repo_root), "website:migrate", "ENV=korczewski"],
        env=env,
        timeout=120,
    )


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@contextlib.contextmanager
def _tcp_listener(port):
    """Accept-and-close TCP listener so the task's TCP-verify succeeds."""
    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(5)
    srv.settimeout(0.5)
    stop = threading.Event()

    def _serve():
        while not stop.is_set():
            try:
                conn, _ = srv.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            try:
                conn.close()
            except OSError:
                pass

    worker = threading.Thread(target=_serve, daemon=True)
    worker.start()
    try:
        yield
    finally:
        stop.set()
        worker.join(timeout=5)
        srv.close()


def test_portforward_death_reports_actionable_diagnostics(run_cmd, repo_root, tmp_path):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    env, call_log, _marker = _write_stubs(tmp_path)
    result = _run_migrate(run_cmd, repo_root, env)
    # The stub replays a realistic kubectl fatal failure, so the task fails ...
    assert result.returncode != 0
    # ... at the port-forward stage. Positive anchors (all true today): they
    # prove the run reached the failing stage instead of dying earlier, which
    # keeps the RED assertions below from passing vacuously.
    assert "Migrate target: context=fleet namespace=workspace-korczewski" in result.output
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


def test_healthy_forward_runs_migration(run_cmd, repo_root, tmp_path):
    """Regression for the T901789 false positive: a healthy forward that is
    still coming up (no output yet on the first poll) must NOT be declared
    dead — the migration runs. Replays the true runner incident shape."""
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    port = _free_port()
    env, call_log, marker = _write_stubs(tmp_path, f"healthy:{port}")
    with _tcp_listener(port):
        result = _run_migrate(run_cmd, repo_root, env)
    assert result.returncode == 0
    assert "port-forward exited unexpectedly" not in result.output
    assert f"Port-forward ready on 127.0.0.1:{port}" in result.output
    assert "port-forward" in call_log.read_text()
    assert marker.exists()
