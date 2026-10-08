"""Native migration of tests/spec/sdlc-cockpit/daemon-runtime-files.bats."""
# (T002721)
# Ergebnis-basiert: echte Daemons, echte Dateien im isolierten COCKPIT_DAEMON_STATE_DIR (tmp_path).
# The BATS setup/teardown copies of /tmp/cockpit-daemon.* are not needed: the port never writes
# to /tmp, so there is no real state to back up or restore.

import os
import signal
import subprocess
import time
from pathlib import Path


def _alive(pid):
    """True if pid exists and is not a zombie."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    try:
        state = Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()[0]
        return state != "Z"
    except (OSError, IndexError):
        return True


def _start_daemon(repo_root, port, state_dir, log_path):
    env = dict(os.environ)
    env["COCKPIT_DAEMON_PORT"] = str(port)
    env["COCKPIT_DAEMON_STATE_DIR"] = str(state_dir)
    with open(log_path, "w", encoding="utf-8") as log:
        return subprocess.Popen(
            ["./node_modules/.bin/tsx", ".lavish/kit/daemon/server.ts"],
            cwd=repo_root, env=env, stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True,
        )


def _wait_health(run_cmd, port):
    for _ in range(120):
        if run_cmd(["curl", "-s", "-m", "1", f"http://127.0.0.1:{port}/health"], timeout=10).returncode == 0:
            return True
        time.sleep(0.25)
    return False


def _stop(proc, state_dir):
    pid_file = Path(state_dir) / "cockpit-daemon.pid"
    if pid_file.exists():
        try:
            os.kill(int(pid_file.read_text().strip()), signal.SIGTERM)
        except (ValueError, ProcessLookupError, PermissionError):
            pass
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def test_t002721_gescheiterter_start_ueberschreibt_pid_und_token_datei_nicht(repo_root, run_cmd, tmp_path):
    port = 39181
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    pidfile = state_dir / "cockpit-daemon.pid"
    tokenfile = state_dir / "cockpit-daemon.token"

    proc = _start_daemon(repo_root, port, state_dir, tmp_path / "A.log")
    try:
        # POSITIV-ANKER: Daemon A laeuft und hat beide Dateien angelegt.
        assert _wait_health(run_cmd, port)
        assert pidfile.is_file()
        assert tokenfile.is_file()

        pid_before = pidfile.read_text()
        token_before = tokenfile.read_text()

        # Die Datei benennt einen lebenden Prozess.
        assert _alive(int(pid_before))

        # Zweiter Daemon auf demselben Port: MUSS scheitern.
        second = run_cmd(
            ["timeout", "60", "./node_modules/.bin/tsx", ".lavish/kit/daemon/server.ts"],
            cwd=repo_root,
            env={"COCKPIT_DAEMON_PORT": str(port), "COCKPIT_DAEMON_STATE_DIR": str(state_dir)},
            timeout=90,
        )
        assert second.returncode != 0

        # Der Fehlstart hat nichts angefasst.
        assert pidfile.read_text() == pid_before
        assert tokenfile.read_text() == token_before

        # Das Token aus der Datei wird vom laufenden Daemon weiterhin akzeptiert.
        result = run_cmd(
            ["curl", "-s", "-m", "3", "-o", "/dev/null", "-w", "%{http_code}",
             "-X", "POST", "-H", f"Authorization: Bearer {tokenfile.read_text()}",
             f"http://127.0.0.1:{port}/api/cockpit/ticket-action"],
            timeout=20,
        )
        assert result.output == "200"
    finally:
        _stop(proc, state_dir)


def test_t002721_daemon_raeumt_pid_und_token_datei_beim_beenden_auf(repo_root, run_cmd, tmp_path):
    port = 39182
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    pidfile = state_dir / "cockpit-daemon.pid"
    tokenfile = state_dir / "cockpit-daemon.token"

    proc = _start_daemon(repo_root, port, state_dir, tmp_path / "C.log")
    try:
        # POSITIV-ANKER: die Dateien existieren, bevor ihr Verschwinden geprueft wird.
        assert _wait_health(run_cmd, port)
        assert pidfile.is_file()
        assert tokenfile.is_file()

        # Signal an die PID, die der Daemon selbst geschrieben hat.
        server_pid = int(pidfile.read_text().strip())
        os.kill(server_pid, signal.SIGTERM)

        gone = False
        for _ in range(40):
            if not pidfile.exists() and not tokenfile.exists():
                gone = True
                break
            time.sleep(0.25)
        if not gone:
            print("--- verbliebene Dateien ---")
            print(os.listdir(state_dir))
        assert gone

        # Der Prozess ist wirklich beendet.
        dead = False
        for _ in range(40):
            if not _alive(server_pid):
                dead = True
                break
            time.sleep(0.25)
        assert dead
    finally:
        _stop(proc, state_dir)
