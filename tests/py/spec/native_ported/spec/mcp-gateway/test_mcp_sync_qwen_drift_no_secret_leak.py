"""Native migration of tests/spec/mcp-gateway/mcp-sync-qwen-drift-no-secret-leak.bats."""

from pathlib import Path

import pytest

PROBE_REGISTRY = """clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
    harness:
      qwen_code:
        httpUrl: http://localhost:19999/mcp
cluster: {}
"""

STALE_QWEN = """{
  "mcpServers": {
    "probe-http": {
      "httpUrl": "http://localhost:19999/mcp",
      "headers": { "Authorization": "Bearer st4le-rotated-token-1a2b3c" }
    }
  }
}
"""


@pytest.fixture
def sync(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "mcp-sync.sh")


def test_t900839_mcp_sync_sh_check_redacts_bearer_tokens_from_the_qwen_settings_json_drift_diff(
    tmp_path, sync, run_cmd, monkeypatch
):
    """T900839: mcp-sync.sh check redacts bearer tokens from the qwen settings.json drift diff"""
    monkeypatch.delenv("PROBE_TOKEN", raising=False)
    fakehome = tmp_path / "fakehome"
    (fakehome / ".qwen").mkdir(parents=True)
    fixture = tmp_path / "registry.yaml"
    fixture.write_text(PROBE_REGISTRY, encoding="utf-8")
    settings = fakehome / ".qwen" / "settings.json"

    base_env = {"HOME": str(fakehome), "MCP_REGISTRY": str(fixture), "MCP_OUT_DIR": str(tmp_path / "out")}
    render = run_cmd(["bash", sync, "render"], env=base_env)
    assert render.returncode == 0, render.output
    settings.write_text(STALE_QWEN, encoding="utf-8")

    check = run_cmd(["bash", sync, "check"], env={**base_env, "PROBE_TOKEN": "s3cr3t-live-token-9f8e7d"})
    # Positiv-Anker: der Drift-Zweig fuer die qwen-Datei muss ausloesen.
    assert check.returncode == 1, check.output
    assert "DRIFT in settings.json (qwen)" in check.output

    # Negativ-Aussage: weder der aufgeloeste noch der veraltete Token taucht im Output auf.
    assert "s3cr3t-live-token-9f8e7d" not in check.output
    assert "st4le-rotated-token-1a2b3c" not in check.output
