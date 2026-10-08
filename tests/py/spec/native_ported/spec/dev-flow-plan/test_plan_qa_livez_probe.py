"""Native migration of tests/spec/dev-flow-plan/plan-qa-livez-probe.bats."""
# T002641: plan-qa-check.sh must probe /livez (liveness), not /health (readiness, returns 503 when
# a priority-1 backend is missing). Command output verification [T002448-M4]: the script runs

# against a fake gateway started on a kernel-assigned port.

import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")

FAKE_GATEWAY = r'''
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1])
POST_STATUS = int(sys.argv[2])

class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = body.encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/livez":
            self._send(200, '{"alive":true}')
        elif self.path == "/health":
            self._send(503, '{"status":"degraded","ready":false}')
        else:
            self._send(404, '{"error":"not found"}')

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        self.rfile.read(length)
        if POST_STATUS == 409:
            self._send(409, '{"error":{"code":"exclusive_conflict","message":"teilt exclusiveGroup"}}')
        else:
            self._send(POST_STATUS, '{"error":"stub"}')

    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", PORT), H).serve_forever()
'''

PLAN = """---
title: "Fixture — Implementation Plan"
ticket_id: T002641
domains: [test]
status: active
---

# Fixture Implementation Plan

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Beispiel

Ein Schritt, damit der Plan die Mindestlaenge erreicht.

## Task 2: Abschluss

- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
"""


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _status(url: str) -> str:
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            return str(resp.status)
    except urllib.error.HTTPError as err:
        return str(err.code)
    except OSError:
        return "000"


@pytest.fixture
def plan(tmp_path):
    p = tmp_path / "plan.md"
    p.write_text(PLAN, encoding="utf-8")
    return p


@pytest.fixture
def start_fake_gateway():
    procs = []

    def _start(port: int, post_status: int):
        proc = subprocess.Popen(
            [sys.executable, "-c", FAKE_GATEWAY, str(port), str(post_status)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        procs.append(proc)
        for _ in range(100):
            if _status(f"http://127.0.0.1:{port}/livez") == "200":
                return proc
            time.sleep(0.1)
        pytest.fail(f"Fake-Gateway auf Port {port} wurde nicht bereit")

    yield _start
    for proc in procs:
        proc.kill()
        proc.wait()


@pytest.fixture
def qa(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-qa-check.sh"

    def _run(plan_path, port):
        return run_cmd(["bash", str(script), str(plan_path)],
                       cwd=repo_root, env={"GATEWAY_BASE_URL": f"http://127.0.0.1:{port}"})

    return _run


def test_t002641_lebender_proxy_mit_degradierter_readiness_gilt_nicht_als_unerreichbar(
    plan, start_fake_gateway, qa
):
    port = free_port()
    start_fake_gateway(port, 500)

    # Positive anchor first: the fake gateway behaves as described.
    assert _status(f"http://127.0.0.1:{port}/livez") == "200", "Anker verletzt: /livez nicht 200"
    assert _status(f"http://127.0.0.1:{port}/health") == "503", "Anker verletzt: /health nicht 503"

    res = qa(plan, port)
    assert "not reachable" not in res.output, f"REGRESSION: lebender Proxy als 'not reachable' gemeldet\n{res.output}"


def test_t002641_gestoppter_proxy_gilt_weiterhin_als_unerreichbar_und_bricht_nicht(plan, qa):
    port = free_port()  # deliberately no server on this port
    res = qa(plan, port)
    assert res.returncode == 0, f"advisory QA muss exit 0 liefern, war {res.returncode}\n{res.output}"
    assert "not reachable" in res.output, f"MISSING: fehlender Gateway wurde nicht als 'not reachable' gemeldet\n{res.output}"


def test_t002641_blockiertes_modell_wird_als_http_status_gemeldet_nicht_als_unerreichbarkeit(
    plan, start_fake_gateway, qa
):
    port = free_port()
    start_fake_gateway(port, 409)
    res = qa(plan, port)
    assert "409" in res.output, f"MISSING: der 409 des Gateways taucht in der Diagnose nicht auf\n{res.output}"
    assert "not reachable" not in res.output, f"REGRESSION: 409 wurde als 'not reachable' gemeldet\n{res.output}"
