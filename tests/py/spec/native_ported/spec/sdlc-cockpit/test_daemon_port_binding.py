"""Native migration of tests/spec/sdlc-cockpit/daemon-port-binding.bats."""
# (T002708)
# Pruefmodus gemischt, je Test benannt: Test 1 ergebnis-basiert (echter Blocker-Port, echter Daemon-Lauf),
# Test 2 Konfigurationspruefung per Text-Scan (dokumentierte Ausnahme).

import re
import subprocess
import time

import pytest


def _curl(run_cmd, url):
    return run_cmd(["curl", "-s", "-m", "1", url], timeout=10).stdout


def test_t002708_daemon_meldet_kein_listening_wenn_der_bind_fehlschlaegt(repo_root, run_cmd, tmp_path):
    block_port = 39190
    blocker_log = tmp_path / "blocker.log"
    daemon_log = tmp_path / "daemon.log"

    script = (
        "require('http').createServer((q, s) => s.end('blocker'))"
        f".listen({block_port}, '127.0.0.1')"
    )
    with open(blocker_log, "w", encoding="utf-8") as log:
        blocker = subprocess.Popen(["node", "-e", script], stdout=log, stderr=subprocess.STDOUT)
    try:
        # POSITIV-ANKER: der Blocker haelt den Port tatsaechlich.
        blocking = False
        for _ in range(40):
            if _curl(run_cmd, f"http://127.0.0.1:{block_port}/") == "blocker":
                blocking = True
                break
            time.sleep(0.25)
        assert blocking

        # Der Daemon laeuft gegen den belegten Port und MUSS scheitern.
        daemon = run_cmd(
            ["timeout", "60", "npx", "tsx", ".lavish/kit/daemon/server.ts"],
            cwd=repo_root,
            env={"COCKPIT_DAEMON_PORT": str(block_port)},
            timeout=90,
        )
        daemon_status = daemon.returncode
        daemon_log.write_text(daemon.output, encoding="utf-8")
    finally:
        blocker.kill()
        blocker.wait()

    log_text = daemon_log.read_text(encoding="utf-8")
    if "listening on" in log_text:
        print("--- daemon.log (meldet listening, obwohl der Port belegt war) ---")
        print(log_text)

    # Kein Erfolgs-Log ohne Erfolg.
    assert "listening on" not in log_text
    # Fehlschlag als solcher erkennbar: benannter Port plus Ursache.
    assert str(block_port) in log_text
    assert re.search(r"EADDRINUSE|belegt|reserviert", log_text, re.IGNORECASE)
    # Ein gescheiterter Start endet mit einem Fehlercode, nicht mit 0.
    assert daemon_status != 0


def test_t002708_kein_konfigurierter_cockpit_port_liegt_im_hyper_v_reservierungsbereich(repo_root):
    server_ts = (repo_root / ".lavish/kit/daemon/server.ts").read_text(encoding="utf-8")

    # POSITIV-ANKER: der Default-Port des Daemons ist auffindbar und plausibel.
    default_match = re.search(r"COCKPIT_DAEMON_PORT \|\| '([0-9]+)'", server_ts)
    assert default_match, "COCKPIT_DAEMON_PORT default not found"
    default_port = int(default_match.group(1))
    assert 1024 < default_port < 49152

    # Scan-Dateiliste, ohne diese Datei selbst.
    files = [
        repo_root / ".lavish/kit/daemon/server.ts",
        repo_root / ".lavish/kit/adapter.js",
        repo_root / ".lavish/kit/canvas-store.js",
    ]
    # [T901392] Die Cockpit-Tests sind pytest-Module.
    cockpit_tests = repo_root / "tests/py/spec/native_ported/spec/sdlc-cockpit"
    files += sorted(cockpit_tests.glob("test_*.py"))
    files = [f for f in files if f.name != "test_daemon_port_binding.py"]

    # POSITIV-ANKER fuer den Scan: die Dateiliste ist nicht leer.
    assert len(files) > 3

    reserved = re.compile(r"\b(4915[2-9]|491[6-9][0-9]|492[0-4][0-9]|4925[01])\b")
    comment = re.compile(r"^\s*(#|//)")
    hits = set()
    for f in files:
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if comment.match(line):
                continue
            hits.update(reserved.findall(line))
    assert not hits, f"Ports im reservierten Bereich 49152-49251 gefunden: {' '.join(sorted(hits))}"

    # Der Taskfile-Task startet denselben Daemon und darf nicht auf einen anderen Port zeigen.
    lines = (repo_root / "taskfiles/Taskfile.web.yml").read_text(encoding="utf-8").splitlines()
    start = next((i for i, line in enumerate(lines) if line == "  cockpit:daemon:"), None)
    assert start is not None
    block = []
    for line in lines[start + 1:]:
        if re.match(r"^  [a-z]", line):
            break
        block.append(line)
    port_match = re.search(r'default "([0-9]+)"', "\n".join(block))
    assert port_match, "task port default not found"
    assert int(port_match.group(1)) < 49152
