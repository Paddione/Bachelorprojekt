"""Native migration of tests/spec/mcp-gateway/agy-token-expansion.bats."""

import json
import os
from pathlib import Path

import pytest

FIXTURE_REGISTRY = """clients:
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


class Ctx:
    def __init__(self, base: Path):
        self.base = base
        self.fakehome = base / "fakehome"
        self.agy_out = self.fakehome / ".gemini" / "config" / "mcp_config.json"
        self.registry = base / "registry.yaml"
        (self.fakehome / ".gemini" / "config").mkdir(parents=True)
        self.registry.write_text(FIXTURE_REGISTRY, encoding="utf-8")

    def write_server_env(self, content: str) -> None:
        d = self.fakehome / ".config" / "bge-mcp"
        d.mkdir(parents=True, exist_ok=True)
        (d / "server.env").write_text(content + "\n", encoding="utf-8")

    def env(self, **extra) -> dict:
        env = {
            "HOME": str(self.fakehome),
            "MCP_REGISTRY": str(self.registry),
            "MCP_OUT_DIR": str(self.base),
        }
        env.update(extra)
        return env

    def agy_config(self) -> dict:
        return json.loads(self.agy_out.read_text(encoding="utf-8"))


@pytest.fixture
def ctx(tmp_path) -> Ctx:
    return Ctx(tmp_path)


@pytest.fixture
def sync(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "mcp-sync.sh")


@pytest.fixture(autouse=True)
def _no_probe_token_in_env(monkeypatch):
    monkeypatch.delenv("PROBE_TOKEN", raising=False)


def test_agy_renderer_resolves_var_from_the_environment(ctx, sync, run_cmd):
    """agy renderer resolves ${VAR} from the environment"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-4711"))
    assert result.returncode == 0, result.output
    header = ctx.agy_config()["mcpServers"]["probe-http"]["headers"]["Authorization"]
    assert header == "Bearer env-value-4711"


def test_agy_renderer_falls_back_to_server_env_when_the_environment_is_empty(ctx, sync, run_cmd):
    """agy renderer falls back to server.env when the environment is empty"""
    ctx.write_server_env("PROBE_TOKEN=from-server-env-4712")
    result = run_cmd(["bash", sync, "render"], env=ctx.env())
    assert result.returncode == 0, result.output
    header = ctx.agy_config()["mcpServers"]["probe-http"]["headers"]["Authorization"]
    assert header == "Bearer from-server-env-4712"


def test_unresolvable_placeholder_is_kept_warned_about_and_does_not_fail_the_render(ctx, sync, run_cmd):
    """unresolvable placeholder is kept, warned about, and does not fail the render"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env())
    assert result.returncode == 0, result.output

    # Positiv-Anker zuerst: der Renderer muss die Datei geschrieben haben.
    assert ctx.agy_out.is_file()
    server = ctx.agy_config()["mcpServers"]["probe-http"]
    assert server["serverUrl"] == "http://localhost:19999/mcp"
    assert server["headers"]["Authorization"] == "Bearer ${PROBE_TOKEN}"

    # Die Warnung nennt die Variable.
    result = run_cmd(["bash", sync, "render"], env=ctx.env())
    assert "PROBE_TOKEN" in result.output


def test_header_values_without_a_placeholder_pass_through_untouched(ctx, sync, run_cmd):
    """header values without a placeholder pass through untouched"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-4711"))
    assert result.returncode == 0, result.output
    assert ctx.agy_config()["mcpServers"]["probe-http"]["headers"]["X-Static"] == "no-placeholder-here"


def test_the_agy_config_is_written_user_readable_only_because_it_carries_a_resolved_secret(
    ctx, sync, run_cmd
):
    """the agy config is written user-readable only, because it carries a resolved secret"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-4711"))
    assert result.returncode == 0, result.output
    assert oct(ctx.agy_out.stat().st_mode & 0o777)[2:] == "600"

    # Bestandsfall: vorhandene Datei mit 644 muss auf 600 gesetzt werden.
    os.chmod(ctx.agy_out, 0o644)
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-4711"))
    assert result.returncode == 0, result.output
    assert oct(ctx.agy_out.stat().st_mode & 0o777)[2:] == "600"


def test_the_repository_tracked_renderers_never_receive_the_resolved_value(ctx, sync, run_cmd):
    """the repository-tracked renderers never receive the resolved value"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-4711"))
    assert result.returncode == 0, result.output

    # Claude-Renderer ueberspringt probe-http (hat ${VAR} in Headers).
    claude = json.loads((ctx.base / ".mcp.json").read_text(encoding="utf-8"))
    assert claude["mcpServers"].get("probe-http") is None

    # OpenCode-Renderer uebersetzt ${VAR} in {env:VAR}.
    opencode = (ctx.base / ".opencode" / "opencode.jsonc").read_text(encoding="utf-8")
    assert sum(1 for line in opencode.splitlines() if "{env:PROBE_TOKEN}" in line) >= 1

    # Der aufgeloeste Wert taucht in keiner der getrackten Dateien auf.
    mcp_text = (ctx.base / ".mcp.json").read_text(encoding="utf-8")
    assert "env-value-4711" not in mcp_text
    assert "env-value-4711" not in opencode
