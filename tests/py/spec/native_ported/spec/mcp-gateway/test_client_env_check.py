"""Native migration of tests/spec/mcp-gateway/client-env-check.bats."""

import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest

FAKE_SERVER = '''import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

port = int(sys.argv[1])
expected_token = sys.argv[2]

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        self.rfile.read(length)
        auth = self.headers.get('Authorization', '')
        if auth == 'Bearer ' + expected_token:
            self.send_response(200)
        else:
            self.send_response(401)
            self.send_header('www-authenticate', 'Bearer')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{}')

    def log_message(self, fmt, *args):
        pass

HTTPServer(('127.0.0.1', port), Handler).serve_forever()
'''


@pytest.fixture
def check(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "bge-mcp" / "check-client-env.sh")


@pytest.fixture
def tmpd(tmp_path: Path) -> Path:
    if shutil.which("python3") is None:
        pytest.skip("python3 nicht verfuegbar")
    (tmp_path / "fake_server.py").write_text(FAKE_SERVER, encoding="utf-8")
    return tmp_path


@pytest.fixture
def start_fake_server(tmpd):
    procs = []

    def _start(port: int, token: str) -> None:
        proc = subprocess.Popen(
            ["python3", str(tmpd / "fake_server.py"), str(port), token],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        procs.append(proc)
        deadline = time.time() + 5
        while time.time() < deadline:
            with socket.socket() as s:
                s.settimeout(0.2)
                if s.connect_ex(("127.0.0.1", port)) == 0:
                    return
            time.sleep(0.1)

    yield _start
    for proc in procs:
        proc.kill()
        proc.wait()


@pytest.fixture(autouse=True)
def _no_token_in_env(monkeypatch):
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)


def test_exit_0_and_no_leaked_token_value_when_server_env_has_a_valid_bge_mcp_token_and_server_accepts_it(
    tmpd, check, run_cmd, start_fake_server
):
    """exit 0 and no leaked token value when server.env has a valid BGE_MCP_TOKEN and server accepts it"""
    port = 19501
    token = "s3cr3t-test-token-do-not-leak"
    start_fake_server(port, token)
    (tmpd / "server.env").write_text(f"BGE_MCP_TOKEN={token}\n", encoding="utf-8")

    result = run_cmd(
        ["bash", check],
        env={"BGE_MCP_CLIENT_ENV_FILE": str(tmpd / "server.env"), "BGE_MCP_HOST": "127.0.0.1",
             "BGE_MCP_PORT": str(port)},
    )
    assert result.returncode == 0, result.output
    assert "OK" in result.output
    # Positiv-Anker vor dem Negativ-Check.
    assert "BGE_MCP_TOKEN ist in" in result.output
    assert token not in result.output


def test_exit_1_when_server_env_is_missing_token_unset_with_fix_hint_in_output(tmpd, check, run_cmd):
    """exit 1 when server.env is missing (token unset), with fix hint in output"""
    result = run_cmd(
        ["bash", check],
        env={"BGE_MCP_CLIENT_ENV_FILE": str(tmpd / "does-not-exist.env"), "BGE_MCP_HOST": "127.0.0.1",
             "BGE_MCP_PORT": "19502"},
    )
    assert result.returncode == 1
    assert "Fix:" in result.output


def test_exit_1_when_server_env_exists_but_bge_mcp_token_is_not_set(tmpd, check, run_cmd):
    """exit 1 when server.env exists but BGE_MCP_TOKEN is not set"""
    (tmpd / "no-token.env").write_text("SOME_OTHER_VAR=irrelevant\n", encoding="utf-8")
    result = run_cmd(
        ["bash", check],
        env={"BGE_MCP_CLIENT_ENV_FILE": str(tmpd / "no-token.env"), "BGE_MCP_HOST": "127.0.0.1",
             "BGE_MCP_PORT": "19503"},
    )
    assert result.returncode == 1
    assert "Fix:" in result.output


def test_exit_2_when_the_bge_mcp_server_is_not_reachable(tmpd, check, run_cmd):
    """exit 2 when the bge-mcp server is not reachable"""
    (tmpd / "server.env").write_text("BGE_MCP_TOKEN=irrelevant-because-server-is-down\n", encoding="utf-8")
    # Port 19504 hat bewusst keinen Listener.
    result = run_cmd(
        ["bash", check],
        env={"BGE_MCP_CLIENT_ENV_FILE": str(tmpd / "server.env"), "BGE_MCP_HOST": "127.0.0.1",
             "BGE_MCP_PORT": "19504"},
    )
    assert result.returncode == 2
    assert "nicht erreichbar" in result.output


def test_exit_1_when_token_in_server_env_does_not_match_the_servers_token(
    tmpd, check, run_cmd, start_fake_server
):
    """exit 1 when token in server.env does not match the server's token"""
    port = 19505
    start_fake_server(port, "correct-token")
    (tmpd / "server.env").write_text("BGE_MCP_TOKEN=wrong-token\n", encoding="utf-8")
    result = run_cmd(
        ["bash", check],
        env={"BGE_MCP_CLIENT_ENV_FILE": str(tmpd / "server.env"), "BGE_MCP_HOST": "127.0.0.1",
             "BGE_MCP_PORT": str(port)},
    )
    assert result.returncode == 1
    assert "HTTP 401" in result.output
