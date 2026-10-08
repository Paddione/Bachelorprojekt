"""Native migration of tests/spec/sdlc-cockpit/daemon-runtime-contract.bats."""
# (T002508)
# Port notes:
# - The BATS test 3 (fail-closed gate) re-invoked bats. The port evaluates the same precondition
# (daemon-endpoints.bats via require_daemon) in-process: unset variable -> skip, set -> fail.
# - The daemon is started in its own process group so the whole npx/tsx chain is terminated.

import json
import os
import re
import signal
import subprocess
import time
from pathlib import Path

import pytest


def _load_sibling(name):
    import importlib.util

    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(f"_native_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _curl_ok(run_cmd, url):
    return run_cmd(["curl", "-s", "-m", "1", url], timeout=10).returncode == 0


def test_t002508_daemon_dependencies_sind_in_package_json_deklariert(repo_root, run_cmd):
    # POSITIV-ANKER: package.json ist lesbar und jq funktioniert.
    result = run_cmd(["jq", "-r", ".name", "package.json"], cwd=repo_root)
    assert result.returncode == 0, result.output
    assert result.stdout.strip() == "bachelorprojekt-scripts"

    # Beide Laufzeit-Abhaengigkeiten des Daemons muessen deklariert sein.
    result = run_cmd(["jq", "-r", '(.dependencies.hono // .devDependencies.hono) // "MISSING"', "package.json"], cwd=repo_root)
    assert result.stdout.strip() != "MISSING"

    result = run_cmd(
        ["jq", "-r", '(.dependencies["@hono/node-server"] // .devDependencies["@hono/node-server"]) // "MISSING"', "package.json"],
        cwd=repo_root,
    )
    assert result.stdout.strip() != "MISSING"


def test_t002508_hono_ist_tatsaechlich_aufloesbar_nicht_nur_deklariert(repo_root, run_cmd):
    result = run_cmd(
        ["node", "-e", "import('hono').then(m => { if (typeof m.Hono !== 'function') process.exit(1); })"],
        cwd=repo_root,
    )
    assert result.returncode == 0, result.output

    result = run_cmd(
        ["node", "-e", "import('@hono/node-server').then(m => { if (typeof m.serve !== 'function') process.exit(1); })"],
        cwd=repo_root,
    )
    assert result.returncode == 0, result.output


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


def _stop_daemon(proc, state_dir):
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


def test_t002508_daemon_startet_aus_dem_checkout_und_antwortet_auf_health(repo_root, run_cmd, tmp_path):
    # 39199 statt 49199 [T002708]: der alte Port lag im Hyper-V-Reservierungsbereich.
    port = 39199
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    proc = _start_daemon(repo_root, port, state_dir, tmp_path / "daemon.log")
    ok = False
    try:
        for _ in range(120):
            if _curl_ok(run_cmd, f"http://127.0.0.1:{port}/health"):
                ok = True
                break
            time.sleep(0.25)
    finally:
        _stop_daemon(proc, state_dir)

    if not ok:
        print("--- daemon.log ---")
        print((tmp_path / "daemon.log").read_text(encoding="utf-8", errors="replace"))
    assert ok


def test_t002508_mit_cockpit_daemon_required_schlaegt_ein_fehlender_daemon_fehl_statt_zu_skippen(repo_root, run_cmd, monkeypatch):
    # Ein Port, auf dem garantiert nichts lauscht.
    dead_port = 39198
    endpoints = _load_sibling("test_daemon_endpoints.py")

    # POSITIV-ANKER: ohne die Variable ist Skippen das gewollte Verhalten.
    monkeypatch.delenv("COCKPIT_DAEMON_REQUIRED", raising=False)
    monkeypatch.setenv("COCKPIT_DAEMON_PORT", str(dead_port))
    with pytest.raises(pytest.skip.Exception):
        endpoints._require_daemon(repo_root, run_cmd)

    # Der eigentliche Gegenstand: mit gesetzter Variable darf NICHT geskippt werden.
    monkeypatch.setenv("COCKPIT_DAEMON_REQUIRED", "1")
    with pytest.raises(pytest.fail.Exception):
        endpoints._require_daemon(repo_root, run_cmd)


def test_t002508_ci_startet_den_daemon_und_setzt_cockpit_daemon_required(repo_root):
    # Pruefmodus grep (Ausnahme T002448-M4): Gegenstand ist die CI-Konfiguration.
    ci = (repo_root / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    # POSITIV-ANKER: der Job, in dem die spec-Suite laeuft, existiert.
    assert sum(1 for line in ci.splitlines() if line.startswith("  test-spec-shard:")) == 1

    assert ci.count("COCKPIT_DAEMON_REQUIRED") >= 1
    assert ci.count("cockpit:daemon") >= 1


def test_t002508_task_cockpit_daemon_ist_definiert(repo_root):
    # POSITIV-ANKER: das Taskfile ist parsebar und der bekannte Nachbar-Task da.
    lines = (repo_root / "taskfiles/Taskfile.web.yml").read_text(encoding="utf-8").splitlines()
    assert sum(1 for line in lines if line.startswith("  cockpit:dev:")) == 1
    assert sum(1 for line in lines if line.startswith("  cockpit:daemon:")) == 1

