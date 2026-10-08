"""Native migration of tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats."""
import re
import shutil
import socket
import subprocess
import time

import pytest

# T002543 — the mcp-gateway watchdog must check TUNNEL liveness, not process liveness.
# Output verification [T002448-M4]: the probe is executed against live and dead ports.

MOCK_TEMPLATE = '''
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "__PATH__":
            body = (b'{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":'
                    b'"2024-11-05","serverInfo":{"name":"mock","version":"1.0"}}}')
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass

HTTPServer(("127.0.0.1", int(os.environ["PORT"])), H).serve_forever()
'''


@pytest.fixture
def probe(repo_root):
    return str(repo_root / "scripts" / "mcp-gateway" / "probe.sh")


@pytest.fixture
def background():
    """Start a background process for the duration of a test and kill it afterwards."""
    procs = []

    def _start(args, env=None):
        import os

        full_env = os.environ.copy()
        if env:
            full_env.update(env)
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                env=full_env)
        procs.append(proc)
        return proc

    yield _start
    for proc in procs:
        try:
            proc.kill()
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001 - cleanup must not mask the test result
            pass


def _wait_for_port(port: int, timeout: float = 5.0) -> None:
    """Replaces the BATS `sleep 0.5`: wait until the listener accepts connections."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.05)


def _mock_server(path: str) -> list:
    return ["python3", "-c", MOCK_TEMPLATE.replace("__PATH__", path)]


def test_t002543_probe_script_exists_and_is_executable(probe):
    import os

    assert os.access(probe, os.X_OK)


def test_t002543_a_dead_port_is_reported_as_an_error_not_a_success(run_cmd, probe):
    # Positive anchor first: the script runs and knows its invocation.
    r = run_cmd([probe, "--help"], timeout=300)
    assert r.returncode == 0
    # Port 1 is privileged and guaranteed unbound here.
    r = run_cmd([probe, "--port", "1", "--timeout", "2"], timeout=300)
    assert r.returncode != 0


def test_t002543_a_tcp_listener_without_mcp_reply_counts_as_dead(run_cmd, probe, background):
    if shutil.which("nc") is None:
        pytest.skip("nc nicht verfuegbar")
    port = 45871
    background(["nc", "-l", "-p", str(port)])
    time.sleep(0.5)

    r = run_cmd([probe, "--port", str(port), "--timeout", "2"], timeout=300)
    assert r.returncode != 0
    assert str(port) in r.output


def test_t002543_the_probe_names_the_checked_port_in_the_failure_case(run_cmd, probe):
    # Existence anchor, then a port whose digits cannot occur in a shell error message.
    import os

    assert os.access(probe, os.X_OK)
    r = run_cmd([probe, "--port", "45872", "--timeout", "2"], timeout=300)
    assert r.returncode != 0
    assert r.returncode != 127
    assert "45872" in r.output


def test_t002543_watchdog_units_are_versioned_and_reference_the_probe(repo_root):
    timer = repo_root / "scripts" / "mcp-gateway" / "mcp-gateway-watchdog.timer"
    svc = repo_root / "scripts" / "mcp-gateway" / "mcp-gateway-watchdog.service"
    check = repo_root / "scripts" / "mcp-gateway" / "watchdog-check.sh"
    import os

    assert timer.is_file()
    assert svc.is_file()
    assert os.access(check, os.X_OK)
    assert "watchdog-check.sh" in svc.read_text(encoding="utf-8")
    check_text = check.read_text(encoding="utf-8")
    assert "probe.sh" in check_text
    assert re.search(r"mcp-gateway\.service", check_text)


def test_t002543_the_timer_fires_repeatedly_not_only_once_at_boot(repo_root):
    timer = repo_root / "scripts" / "mcp-gateway" / "mcp-gateway-watchdog.timer"
    assert timer.is_file()
    assert re.search(r"OnUnitActiveSec=|OnCalendar=", timer.read_text(encoding="utf-8"))


def test_t006996_the_probe_answers_on_the_mcp_endpoint_success_case(run_cmd, probe, background):
    if shutil.which("python3") is None:
        pytest.skip("python3 nicht verfuegbar")
    port = 45901
    background(_mock_server("/mcp"), env={"PORT": str(port)})
    _wait_for_port(port)

    r = run_cmd([probe, "--port", str(port), "--timeout", "2"], timeout=300)
    assert r.returncode == 0


def test_t006996_mcp_reply_only_at_root_path_counts_as_dead(run_cmd, probe, background):
    if shutil.which("python3") is None:
        pytest.skip("python3 nicht verfuegbar")
    port = 45902
    background(_mock_server("/"), env={"PORT": str(port)})
    _wait_for_port(port)

    r = run_cmd([probe, "--port", str(port), "--timeout", "2"], timeout=300)
    assert r.returncode != 0
    assert str(port) in r.output
