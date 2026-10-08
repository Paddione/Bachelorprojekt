"""Native migration of tests/spec/mcp-gateway/native-server-startup-token.bats."""

import shutil
import socket

import pytest


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) != 0


@pytest.fixture
def free_port():
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")
    port = next((p for p in range(19850, 19881) if _port_is_free(p)), None)
    if port is None:
        pytest.skip("kein freier Port im Bereich 19850-19880")
    return port


def _assert_no_port_bound(run_cmd, port: int) -> None:
    """curl prints 000 when nothing listens, or fails outright."""
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "1",
                      f"http://127.0.0.1:{port}/"])
    assert result.stdout == "000" or result.returncode != 0, result.stdout


def test_bge_mcp_exits_non_zero_when_bge_mcp_token_is_absent(repo_root, run_cmd, free_port, monkeypatch):
    """bge-mcp: exits non-zero when BGE_MCP_TOKEN is absent"""
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)
    result = run_cmd(["node", str(repo_root / "scripts" / "bge-mcp" / "server.mjs")],
                     env={"BGE_MCP_PORT": str(free_port)})
    assert result.returncode != 0


def test_bge_mcp_error_message_names_bge_mcp_token(repo_root, run_cmd, free_port, monkeypatch):
    """bge-mcp: error message names BGE_MCP_TOKEN"""
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)
    result = run_cmd(["node", str(repo_root / "scripts" / "bge-mcp" / "server.mjs")],
                     env={"BGE_MCP_PORT": str(free_port)})
    assert "MCP-HTTPSEC: Pflicht-Token fehlt" in result.output
    assert "BGE_MCP_TOKEN" in result.output


def test_bge_mcp_does_not_bind_port_when_token_is_absent(repo_root, run_cmd, free_port, monkeypatch):
    """bge-mcp: does not bind port when token is absent"""
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)
    result = run_cmd(["node", str(repo_root / "scripts" / "bge-mcp" / "server.mjs")],
                     env={"BGE_MCP_PORT": str(free_port)})
    assert result.returncode != 0
    _assert_no_port_bound(run_cmd, free_port)


def test_mcp_postgres_local_exits_non_zero_when_mcp_postgres_token_is_absent(repo_root, run_cmd, free_port, monkeypatch):
    """mcp-postgres-local: exits non-zero when MCP_POSTGRES_TOKEN is absent"""
    monkeypatch.delenv("MCP_POSTGRES_TOKEN", raising=False)
    result = run_cmd(["node", str(repo_root / "scripts" / "mcp-gateway" / "mcp-postgres-local.mjs")],
                     env={"PORT": str(free_port)})
    assert result.returncode != 0


def test_mcp_postgres_local_error_message_names_mcp_postgres_token(repo_root, run_cmd, free_port, monkeypatch):
    """mcp-postgres-local: error message names MCP_POSTGRES_TOKEN"""
    monkeypatch.delenv("MCP_POSTGRES_TOKEN", raising=False)
    result = run_cmd(["node", str(repo_root / "scripts" / "mcp-gateway" / "mcp-postgres-local.mjs")],
                     env={"PORT": str(free_port)})
    assert "MCP-HTTPSEC: Pflicht-Token fehlt" in result.output
    assert "MCP_POSTGRES_TOKEN" in result.output


def test_mcp_postgres_local_does_not_bind_port_when_token_is_absent(repo_root, run_cmd, free_port, monkeypatch):
    """mcp-postgres-local: does not bind port when token is absent"""
    monkeypatch.delenv("MCP_POSTGRES_TOKEN", raising=False)
    result = run_cmd(["node", str(repo_root / "scripts" / "mcp-gateway" / "mcp-postgres-local.mjs")],
                     env={"PORT": str(free_port)})
    assert result.returncode != 0
    _assert_no_port_bound(run_cmd, free_port)
