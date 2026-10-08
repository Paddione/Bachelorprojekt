"""Native migration of tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats."""

import shutil
from pathlib import Path

import pytest


@pytest.fixture
def server(repo_root: Path) -> Path:
    # Windows/MSYS-Pfadumwandlung (cygpath) entfaellt: der Port laeuft nur auf Linux.
    return repo_root / "scripts" / "bge-mcp" / "server.mjs"


def test_bge_mcp_shim_laedt_den_bge_router_und_erreicht_die_token_pruefung(server, run_cmd, monkeypatch):
    """bge-mcp shim laedt den bge-router und erreicht die Token-Pruefung"""
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)
    result = run_cmd(["node", str(server)], timeout=60)
    # Positiv-Anker: Start bis zur Token-Pruefung gekommen, Router-Import geglueckt.
    assert "MCP-HTTPSEC: Pflicht-Token fehlt" in result.output


def test_bge_mcp_shim_scheitert_nicht_am_esm_url_schema(server, run_cmd, monkeypatch):
    """bge-mcp shim scheitert nicht am ESM-URL-Schema"""
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)
    result = run_cmd(["node", str(server)], timeout=60)
    assert "ERR_UNSUPPORTED_ESM_URL_SCHEME" not in result.output
