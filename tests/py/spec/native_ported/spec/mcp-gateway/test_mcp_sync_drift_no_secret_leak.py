"""Native migration of tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats."""
# Port note: the last case in the original ends with a bare `! grep -qF ...` inside a
# loop, which bats does not treat as a failing assertion, so the case could never fail.

# The port asserts the intended property (no plaintext secret in tracked outputs) directly.

from pathlib import Path

import pytest

PROBE_REGISTRY = """clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
    harness:
      agy:
        serverUrl: http://localhost:19999/mcp
cluster: {}
"""

STALE_AGY = """{
  "mcpServers": {
    "probe-http": {
      "serverUrl": "http://localhost:19999/mcp",
      "headers": { "Authorization": "Bearer STALE-VALUE-NOT-CURRENT" }
    }
  }
}
"""

TWO_SERVER_REGISTRY = """clients:
  server-a:
    transport: http
    endpoint: http://localhost:13001/mcp
    headers:
      Authorization: "Bearer ${SERVER_A_TOKEN}"
    harness:
      agy:
        serverUrl: http://localhost:13001/mcp
  server-b:
    transport: http
    endpoint: http://localhost:13003/mcp
    headers:
      Authorization: "Bearer ${SERVER_B_TOKEN}"
    harness:
      agy:
        serverUrl: http://localhost:13003/mcp
cluster: {}
"""

SECRET_REGISTRY = """clients:
  secret-svc:
    transport: http
    endpoint: http://localhost:13001/mcp
    headers:
      Authorization: "Bearer ${MY_SECRET_TOKEN}"
    harness:
      claude_code:
        type: http
        url: http://localhost:13001/mcp
      opencode:
        type: remote
        url: http://localhost:13001/mcp
        enabled: true
cluster: {}
"""


@pytest.fixture
def sync(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "mcp-sync.sh")


def test_t002941_mcp_sync_sh_check_redacts_expanded_bearer_tokens_from_the_mcp_config_json_drift_diff(
    tmp_path, sync, run_cmd, monkeypatch
):
    """T002941: mcp-sync.sh check redacts expanded bearer tokens from the mcp_config.json drift diff"""
    monkeypatch.delenv("PROBE_TOKEN", raising=False)
    fakehome = tmp_path / "fakehome"
    (fakehome / ".gemini" / "config").mkdir(parents=True)
    fixture = tmp_path / "registry.yaml"
    fixture.write_text(PROBE_REGISTRY, encoding="utf-8")
    (fakehome / ".gemini" / "config" / "mcp_config.json").write_text(STALE_AGY, encoding="utf-8")

    base_env = {"HOME": str(fakehome), "MCP_REGISTRY": str(fixture), "MCP_OUT_DIR": str(tmp_path / "out")}
    render = run_cmd(["bash", sync, "render"], env=base_env)
    assert render.returncode == 0, render.output

    check = run_cmd(["bash", sync, "check"], env={**base_env, "PROBE_TOKEN": "s3cr3t-live-token-9f8e7d"})
    # Positiv-Anker: der Drift-Zweig fuer mcp_config.json muss ausloesen.
    assert check.returncode == 1, check.output
    assert "DRIFT in mcp_config.json" in check.output

    # Negativ-Aussage: der aufgeloeste Token-Wert taucht nirgends im Output auf.
    assert "s3cr3t-live-token-9f8e7d" not in check.output


def test_t900052_server_specific_tokens_are_isolated_in_rendered_configs(tmp_path, sync, run_cmd):
    """T900052: server-specific tokens are isolated in rendered configs"""
    fakehome = tmp_path / "fakehome"
    (fakehome / ".gemini" / "config").mkdir(parents=True)
    fixture = tmp_path / "registry.yaml"
    fixture.write_text(TWO_SERVER_REGISTRY, encoding="utf-8")

    first = run_cmd(["bash", sync, "render"],
                    env={"HOME": str(fakehome), "MCP_REGISTRY": str(fixture), "MCP_OUT_DIR": str(tmp_path / "out")})
    assert first.returncode == 0, first.output

    second = run_cmd(
        ["bash", sync, "render"],
        env={"HOME": str(fakehome), "MCP_REGISTRY": str(fixture), "MCP_OUT_DIR": str(tmp_path / "out"),
             "SERVER_A_TOKEN": "token-for-a-only", "SERVER_B_TOKEN": "token-for-b-only"},
    )
    assert second.returncode == 0, second.output

    config_file = fakehome / ".gemini" / "config" / "mcp_config.json"
    if config_file.is_file():
        lines = config_file.read_text(encoding="utf-8").splitlines()

        def first_match_after(marker: str, window: int, needle: str) -> str:
            for i, line in enumerate(lines):
                if f'"{marker}"' in line:
                    for w in lines[i : i + window + 1]:
                        if needle in w:
                            return w
                    return ""
            return ""

        a_auth = first_match_after("server-a", 10, "Authorization")
        b_auth = first_match_after("server-b", 10, "Authorization")
        assert "token-for-a-only" in a_auth, a_auth
        assert "token-for-b-only" in b_auth, b_auth


def test_t900052_rendered_tracked_outputs_contain_no_plaintext_secrets(tmp_path, sync, run_cmd):
    """T900052: rendered tracked outputs contain no plaintext secrets"""
    fakehome = tmp_path / "fakehome"
    for sub in (".gemini/config", ".qwen", ".claude"):
        (fakehome / sub).mkdir(parents=True)
    fixture = tmp_path / "registry.yaml"
    fixture.write_text(SECRET_REGISTRY, encoding="utf-8")
    out = tmp_path / "out"

    result = run_cmd(
        ["bash", sync, "render"],
        env={"HOME": str(fakehome), "MCP_REGISTRY": str(fixture), "MCP_OUT_DIR": str(out),
             "MY_SECRET_TOKEN": "plaintext-super-secret-value"},
    )
    assert result.returncode == 0, result.output

    for name in (".mcp.json", "opencode.jsonc", "mcp-servers.json"):
        path = out / name
        if path.is_file():
            assert "plaintext-super-secret-value" not in path.read_text(encoding="utf-8"), name
