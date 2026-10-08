"""Native migration of tests/spec/sdlc-cockpit/daemon-test-no-leak.bats."""
# (T002724)
# Port note: the BATS original runs daemon-runtime-contract.bats in a nested bats process. The port
# calls the ported test function directly (same module, same assertions) and then checks the port.

import importlib.util
import re
import time
from pathlib import Path

CONTRACT_PORT = 39199


def _load_sibling(name):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(f"_native_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _port_free(run_cmd, port):
    return run_cmd(["curl", "-s", "-m", "1", f"http://127.0.0.1:{port}/health"], timeout=10).returncode != 0


def _listener_pids(run_cmd, port):
    out = run_cmd(["ss", "-ltnp"], timeout=20).stdout
    pids = []
    for line in out.splitlines():
        if re.search(rf":{port}\b", line):
            pids += re.findall(r"pid=(\d+)", line)
    return pids


def _kill_listeners(run_cmd, port):
    import os
    import signal

    for pid in _listener_pids(run_cmd, port):
        try:
            os.kill(int(pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    time.sleep(1)


def test_t002724_ein_lauf_von_daemon_runtime_contract_hinterlaesst_keinen_daemon(repo_root, run_cmd, tmp_path):
    _kill_listeners(run_cmd, CONTRACT_PORT)

    # POSITIV-ANKER 1: die Ausgangslage stimmt.
    assert _port_free(run_cmd, CONTRACT_PORT)

    # Der fragliche Lauf: der Daemon-Start-Test aus daemon-runtime-contract.
    contract = _load_sibling("test_daemon_runtime_contract.py")
    contract_dir = tmp_path / "contract"
    contract_dir.mkdir()
    # POSITIV-ANKER 2: der Lauf war erfolgreich.
    contract.test_t002508_daemon_startet_aus_dem_checkout_und_antwortet_auf_health(repo_root, run_cmd, contract_dir)

    # Der eigentliche Gegenstand: nach dem Lauf lauscht niemand mehr.
    leaked = True
    for _ in range(20):
        if _port_free(run_cmd, CONTRACT_PORT):
            leaked = False
            break
        time.sleep(0.5)

    if leaked:
        print(f"--- es lauscht noch jemand auf {CONTRACT_PORT} ---")
        print(_listener_pids(run_cmd, CONTRACT_PORT))
        _kill_listeners(run_cmd, CONTRACT_PORT)
    assert not leaked
