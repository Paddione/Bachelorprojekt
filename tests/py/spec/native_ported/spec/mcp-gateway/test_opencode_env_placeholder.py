"""Native migration of tests/spec/mcp-gateway/opencode-env-placeholder.bats."""

import json
import re
import shutil
import tempfile
from pathlib import Path

import pytest

FIXTURE = """clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
      X-Static: "no-placeholder-here"
    harness:
      claude_code:
        type: http
        url: http://localhost:19999/mcp
      agy:
        serverUrl: http://localhost:19999/mcp
      opencode:
        type: remote
        url: http://localhost:19999/mcp
        enabled: true
cluster: {}
"""


@pytest.fixture
def sync(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "mcp-sync.sh")


@pytest.fixture
def tmpd():
    d = Path(tempfile.mkdtemp())
    yield d
    shutil.rmtree(d, ignore_errors=True)


def _render(run_cmd, sync: str, tmpd: Path):
    (tmpd / "registry.yaml").write_text(FIXTURE, encoding="utf-8")
    return run_cmd(
        ["bash", sync, "render"],
        env={"HOME": str(tmpd / "fakehome"), "MCP_REGISTRY": str(tmpd / "registry.yaml"),
             "MCP_OUT_DIR": str(tmpd)},
    )


def test_opencode_renderer_translates_var_into_opencode_s_env_var_syntax(sync, run_cmd, tmpd):
    """opencode renderer translates ${VAR} into opencode's {env:VAR} syntax"""
    result = _render(run_cmd, sync, tmpd)
    assert result.returncode == 0, result.output

    text = (tmpd / ".opencode" / "opencode.jsonc").read_text(encoding="utf-8")
    matches = "".join(re.findall(r'"Authorization":"[^"]*"', text))
    assert "{env:PROBE_TOKEN}" in matches
    # Die Claude-Code-Notation darf in der opencode-Datei nicht mehr auftauchen.
    assert "${PROBE_TOKEN}" not in matches


def test_claude_renderer_skips_servers_with_var_in_headers_t004272(sync, run_cmd, tmpd):
    """claude renderer skips servers with ${VAR} in headers (T004272)"""
    result = _render(run_cmd, sync, tmpd)
    assert result.returncode == 0, result.output

    data = json.loads((tmpd / ".mcp.json").read_text(encoding="utf-8"))
    assert data["mcpServers"].get("probe-http") is None


def test_header_values_without_a_placeholder_pass_through_untouched_in_opencode(sync, run_cmd, tmpd):
    """header values without a placeholder pass through untouched in opencode"""
    result = _render(run_cmd, sync, tmpd)
    assert result.returncode == 0, result.output
    text = (tmpd / ".opencode" / "opencode.jsonc").read_text(encoding="utf-8")
    assert sum(1 for line in text.splitlines() if "no-placeholder-here" in line) >= 1


def test_the_live_bge_mcp_entry_uses_the_syntax_opencode_actually_expands(repo_root):
    """the live bge-mcp entry uses the syntax opencode actually expands"""
    text = (repo_root / ".opencode" / "opencode.jsonc").read_text(encoding="utf-8")
    matches = "".join(re.findall(r'"Authorization":"[^"]*"', text))
    assert "{env:BGE_MCP_TOKEN}" in matches
