"""Native migration of tests/spec/mcp-gateway/http-security-boundary.bats."""

import os
import shutil
import socket
import subprocess
import time

import pytest


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) != 0


@pytest.fixture
def boundary(repo_root, run_cmd, procs_cleanup):
    """Start the boundary fixture listener; yields a start(token, origins=None) callable and a port."""
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")
    port = next((p for p in range(19810, 19841) if _port_is_free(p)), None)
    if port is None:
        pytest.skip("kein freier Port im Bereich 19810-19840")

    module = repo_root / "scripts" / "lib" / "mcp-http-security.mjs"
    script = repo_root / "tests" / "spec" / "mcp-gateway" / "http-security-boundary-server.mjs"

    class B:
        pass

    state = B()
    state.port = port

    def start(token: str, origins: str = None) -> None:
        env = os.environ.copy()
        env.update({"BND_MODULE": str(module), "BND_TOKEN": token, "BND_PORT": str(port)})
        env["BND_ORIGINS"] = origins if origins is not None else ""
        proc = subprocess.Popen(["node", str(script)], env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        procs_cleanup.append(proc)
        for _ in range(50):
            if run_cmd(["curl", "-s", "-o", "/dev/null", "--max-time", "1",
                        f"http://127.0.0.1:{port}/hits"]).returncode == 0:
                return
            time.sleep(0.1)
        proc.kill()
        pytest.skip(f"Boundary-Listener auf {port} nicht hoch")

    state.start = start
    return state


@pytest.fixture
def procs_cleanup():
    started = []
    yield started
    for proc in started:
        if proc.poll() is None:
            proc.kill()
        proc.wait()


RPC = '{"jsonrpc":"2.0","id":1,"method":"ping"}'


def _post(run_cmd, port: int, *extra: str) -> str:
    return run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
                    f"http://127.0.0.1:{port}/mcp", "-H", "content-type: application/json",
                    *extra, "-d", RPC]).stdout


def _hits(run_cmd, port: int) -> str:
    return run_cmd(["curl", "-s", f"http://127.0.0.1:{port}/hits"]).stdout


def test_no_origin_cli_request_with_valid_bearer_is_allowed_and_dispatches(boundary, run_cmd):
    """http-security: no-Origin CLI request with valid bearer is allowed and dispatches"""
    boundary.start("secret-token")
    code = _post(run_cmd, boundary.port, "-H", "Authorization: Bearer secret-token")
    assert code == "200"
    assert _hits(run_cmd, boundary.port) == "1"


def test_exact_allowed_browser_origin_with_valid_bearer_is_allowed(boundary, run_cmd):
    """http-security: exact allowed browser Origin with valid bearer is allowed"""
    boundary.start("secret-token", '["https://app.example.com"]')
    code = _post(run_cmd, boundary.port, "-H", "Authorization: Bearer secret-token",
                 "-H", "Origin: https://app.example.com")
    assert code == "200"


def test_foreign_browser_origin_is_rejected_before_dispatch_403(boundary, run_cmd):
    """http-security: foreign browser Origin is rejected before dispatch (403)"""
    boundary.start("secret-token", '["https://app.example.com"]')
    code = _post(run_cmd, boundary.port, "-H", "Authorization: Bearer secret-token",
                 "-H", "Origin: https://evil.example.com")
    assert code == "403"
    assert _hits(run_cmd, boundary.port) == "0"


def test_malformed_origin_is_rejected_403_never_treated_as_absent(boundary, run_cmd):
    """http-security: malformed Origin is rejected (403), never treated as absent"""
    boundary.start("secret-token", '["https://app.example.com"]')
    code = _post(run_cmd, boundary.port, "-H", "Authorization: Bearer secret-token",
                 "-H", "Origin: not-a-url")
    assert code == "403"
    assert _hits(run_cmd, boundary.port) == "0"


def test_invalid_host_dns_rebinding_is_rejected_before_dispatch_403(boundary, run_cmd):
    """http-security: invalid Host (DNS-rebinding) is rejected before dispatch (403)"""
    boundary.start("secret-token")
    code = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
                    f"http://127.0.0.1:{boundary.port}/mcp", "-H", "Host: evil.example.com",
                    "-H", "Authorization: Bearer secret-token", "-H", "content-type: application/json",
                    "-d", RPC]).stdout
    assert code == "403"
    assert _hits(run_cmd, boundary.port) == "0"


def test_missing_bearer_token_is_rejected_401_without_dispatch(boundary, run_cmd):
    """http-security: missing bearer token is rejected (401) without dispatch"""
    boundary.start("secret-token")
    assert _post(run_cmd, boundary.port) == "401"
    assert _hits(run_cmd, boundary.port) == "0"


def test_wrong_token_is_rejected_401_without_dispatch(boundary, run_cmd):
    """http-security: wrong token is rejected (401) without dispatch"""
    boundary.start("secret-token")
    code = _post(run_cmd, boundary.port, "-H", "Authorization: Bearer wrong-token")
    assert code == "401"
    assert _hits(run_cmd, boundary.port) == "0"


def test_unequal_length_token_is_rejected_401_without_dispatch(boundary, run_cmd):
    """http-security: unequal-length token is rejected (401) without dispatch"""
    boundary.start("secret-token")
    code = _post(run_cmd, boundary.port, "-H", "Authorization: Bearer x")
    assert code == "401"
    assert _hits(run_cmd, boundary.port) == "0"


def test_options_preflight_from_allowed_origin_passes_foreign_origin_denied(boundary, run_cmd):
    """http-security: OPTIONS preflight from allowed origin passes; foreign origin denied"""
    boundary.start("secret-token", '["https://app.example.com"]')
    url = f"http://127.0.0.1:{boundary.port}/mcp"
    ok = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "OPTIONS", url,
                  "-H", "Origin: https://app.example.com", "-H", "Access-Control-Request-Method: POST"]).stdout
    assert ok == "204"
    denied = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "OPTIONS", url,
                      "-H", "Origin: https://evil.example.com", "-H", "Access-Control-Request-Method: POST"]).stdout
    assert denied == "403"
