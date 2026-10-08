"""Native migration of tests/spec/mcp-gateway/bge-http-only-get.bats."""

import json
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest

TOKEN = "bats-throwaway-token-T002703"


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) != 0


@pytest.fixture
def shim(repo_root: Path, run_cmd):
    """Start scripts/bge-mcp/server.mjs on a free port with a throwaway token."""
    if shutil.which("node") is None:
        pytest.skip("node nicht verfuegbar")
    if shutil.which("curl") is None:
        pytest.skip("curl nicht verfuegbar")

    port = next((p for p in range(19620, 19641) if _port_is_free(p)), None)
    if port is None:
        pytest.skip("kein freier Port im Bereich 19620-19640")

    env = os.environ.copy()
    env.update({"BGE_MCP_TOKEN": TOKEN, "BGE_MCP_HOST": "127.0.0.1", "BGE_MCP_PORT": str(port)})
    proc = subprocess.Popen(
        ["node", str(repo_root / "scripts" / "bge-mcp" / "server.mjs")],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    up = False
    deadline = time.time() + 6
    while time.time() < deadline:
        probe = run_cmd(
            ["curl", "-s", "-o", "/dev/null", "--max-time", "1", "-X", "POST",
             "-H", f"Authorization: Bearer {TOKEN}", "-H", "content-type: application/json",
             "-d", "{}", f"http://127.0.0.1:{port}/mcp"]
        )
        if probe.returncode == 0:
            up = True
            break
        time.sleep(0.1)
    if not up:
        proc.kill()
        proc.wait()
        pytest.skip(f"Shim kam auf Port {port} nicht hoch")

    yield port
    proc.kill()
    proc.wait()


INIT_BODY = (
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05",'
    '"capabilities":{},"clientInfo":{"name":"bats","version":"0"}}}'
)


def test_get_mcp_is_rejected_with_405_instead_of_opening_a_silent_sse_channel(shim, run_cmd):
    """GET /mcp is rejected with 405 instead of opening a silent SSE channel"""
    port = shim
    # Positiv-Anker: der Shim antwortet auf dem regulaeren POST-Pfad.
    post = run_cmd(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", "-X", "POST",
         "-H", f"Authorization: Bearer {TOKEN}", "-H", "content-type: application/json",
         "-d", INIT_BODY, f"http://127.0.0.1:{port}/mcp"]
    )
    assert post.stdout == "200", post.stdout

    # Negativ-Aussage: GET liefert 405 und keinen Event-Stream.
    get = run_cmd(
        ["curl", "-s", "-i", "--max-time", "5", "-X", "GET",
         "-H", f"Authorization: Bearer {TOKEN}", "-H", "Accept: text/event-stream",
         f"http://127.0.0.1:{port}/mcp"]
    )
    assert "405" in get.stdout
    assert "text/event-stream" not in get.stdout


def test_post_mcp_still_answers_in_the_response_body(shim, run_cmd):
    """POST /mcp still answers in the response body"""
    port = shim
    body = (
        '{"jsonrpc":"2.0","id":7,"method":"initialize","params":{"protocolVersion":"2024-11-05",'
        '"capabilities":{},"clientInfo":{"name":"bats","version":"0"}}}'
    )
    result = run_cmd(
        ["curl", "-s", "--max-time", "5", "-X", "POST",
         "-H", f"Authorization: Bearer {TOKEN}", "-H", "content-type: application/json",
         "-d", body, f"http://127.0.0.1:{port}/mcp"]
    )
    assert result.returncode == 0, result.output
    data = json.loads(result.stdout)
    assert data.get("id") == 7
    assert "serverInfo" in data.get("result", {})


def test_get_without_authorization_stays_a_401_not_a_405(shim, run_cmd):
    """GET without Authorization stays a 401, not a 405"""
    port = shim
    result = run_cmd(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", "-X", "GET",
         f"http://127.0.0.1:{port}/mcp"]
    )
    assert result.stdout == "401", result.stdout
