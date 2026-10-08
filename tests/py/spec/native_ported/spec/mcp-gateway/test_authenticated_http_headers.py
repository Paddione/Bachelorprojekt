"""Native migration of tests/spec/mcp-gateway/authenticated-http-headers.bats."""

import json
import re
import shutil
import tempfile
from pathlib import Path

import pytest

PROBE_FIXTURE = """clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
      X-Probe: "static-value"
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
def registry(repo_root: Path) -> Path:
    return repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml"


@pytest.fixture
def sync(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "mcp-sync.sh")


def test_registry_declares_an_authorization_header_for_bge_mcp(yaml_load, registry):
    """registry declares an Authorization header for bge-mcp"""
    data = yaml_load(registry)
    client = data["clients"]["bge-mcp"]
    assert client.get("headers"), "bge-mcp hat keine headers"
    auth = client["headers"].get("Authorization")
    assert auth, "kein Authorization-Header"
    assert str(auth).startswith("Bearer")


def test_registry_authorization_value_is_an_env_reference_never_a_literal_token(yaml_load, registry):
    """registry Authorization value is an env reference, never a literal token"""
    auth = yaml_load(registry)["clients"]["bge-mcp"]["headers"]["Authorization"]
    # Positiv-Anker zuerst: der Header existiert.
    assert auth
    assert "${BGE_MCP_TOKEN}" in str(auth)


def test_generated_mcp_json_does_not_carry_bge_mcp_t004272(repo_root):
    """generated .mcp.json does NOT carry bge-mcp (T004272)"""
    data = json.loads((repo_root / ".mcp.json").read_text(encoding="utf-8"))
    assert data["mcpServers"].get("bge-mcp") is None


def test_generated_opencode_jsonc_carries_the_bge_mcp_authorization_header(repo_root):
    """generated opencode.jsonc carries the bge-mcp Authorization header"""
    lines = (repo_root / ".opencode" / "opencode.jsonc").read_text(encoding="utf-8").splitlines()
    count = 0
    for i, line in enumerate(lines):
        if '"bge-mcp"' in line:
            count += sum(1 for w in lines[i : i + 9] if "Authorization" in w)
    assert count >= 1


def test_mcp_sync_sh_check_stays_green_headers_are_generated_not_hand_edited(
    sync, run_cmd, monkeypatch
):
    """mcp-sync.sh check stays green — headers are generated, not hand-edited"""
    # Aufruf-Env entruempeln, damit der Renderer deterministisch aus server.env aufloest.
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)
    monkeypatch.delenv("MCP_POSTGRES_TOKEN", raising=False)
    result = run_cmd(["bash", sync, "check"])
    assert result.returncode == 0, result.output


def test_renderers_pass_headers_through_for_opencode_and_agy_t004272(sync, run_cmd, monkeypatch):
    """renderers pass headers through for opencode and agy (T004272)"""
    monkeypatch.delenv("PROBE_TOKEN", raising=False)
    tmpd = Path(tempfile.mkdtemp())
    try:
        fixture = tmpd / "registry.yaml"
        fixture.write_text(PROBE_FIXTURE, encoding="utf-8")
        result = run_cmd(
            ["bash", sync, "render"],
            env={"HOME": str(tmpd / "fakehome"), "MCP_REGISTRY": str(fixture), "MCP_OUT_DIR": str(tmpd)},
        )
        assert result.returncode == 0, result.output

        claude = json.loads((tmpd / ".mcp.json").read_text(encoding="utf-8"))
        assert claude["mcpServers"].get("probe-http") is None

        opencode = (tmpd / ".opencode" / "opencode.jsonc").read_text(encoding="utf-8")
        auth_matches = "".join(re.findall(r'"Authorization":"[^"]*"', opencode))
        assert "{env:PROBE_TOKEN}" in auth_matches

        x_probe = "".join(re.findall(r'"X-Probe":"[^"]*"', opencode))
        assert "static-value" in x_probe
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)


def test_no_expanded_bearer_token_leaks_into_tracked_harness_configs(repo_root):
    """no expanded bearer token leaks into tracked harness configs"""
    mcp_json = repo_root / ".mcp.json"
    assert mcp_json.is_file()
    data = json.loads(mcp_json.read_text(encoding="utf-8"))

    values = []
    for name, server in data.get("mcpServers", {}).items():
        headers = server.get("headers")
        if headers is None:
            continue
        for key, value in headers.items():
            if key.lower() == "authorization":
                values.append(f"{name}={value}")

    leaked = [v for v in values if not ("${" in v and "}" in v)]
    assert not leaked, f"LEAK: {leaked}"
