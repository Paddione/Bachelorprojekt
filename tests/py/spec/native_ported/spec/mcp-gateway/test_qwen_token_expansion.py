"""Native migration of tests/spec/mcp-gateway/qwen-token-expansion.bats."""

import json
import os
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
      qwen_code:
        httpUrl: http://localhost:19999/mcp
cluster: {}
"""


class Ctx:
    def __init__(self, base: Path):
        self.base = base
        self.fakehome = base / "fakehome"
        (self.fakehome / ".qwen").mkdir(parents=True)
        self.qwen_out = self.fakehome / ".qwen" / "settings.json"
        self.registry = base / "registry.yaml"
        self.registry.write_text(FIXTURE, encoding="utf-8")

    def write_server_env(self, content: str) -> None:
        d = self.fakehome / ".config" / "bge-mcp"
        d.mkdir(parents=True, exist_ok=True)
        (d / "server.env").write_text(content + "\n", encoding="utf-8")

    def env(self, **extra) -> dict:
        env = {"HOME": str(self.fakehome), "MCP_REGISTRY": str(self.registry), "MCP_OUT_DIR": str(self.base)}
        env.update(extra)
        return env

    def qwen(self) -> dict:
        return json.loads(self.qwen_out.read_text(encoding="utf-8"))


@pytest.fixture
def ctx(tmp_path) -> Ctx:
    return Ctx(tmp_path)


@pytest.fixture
def sync(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "mcp-sync.sh")


@pytest.fixture(autouse=True)
def _no_probe_token_in_env(monkeypatch):
    monkeypatch.delenv("PROBE_TOKEN", raising=False)


def test_qwen_renderer_resolves_var_from_the_environment(ctx, sync, run_cmd):
    """qwen renderer resolves ${VAR} from the environment"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-5821"))
    assert result.returncode == 0, result.output
    assert ctx.qwen()["mcpServers"]["probe-http"]["headers"]["Authorization"] == "Bearer env-value-5821"


def test_qwen_renderer_falls_back_to_server_env_when_the_environment_is_empty(ctx, sync, run_cmd):
    """qwen renderer falls back to server.env when the environment is empty"""
    ctx.write_server_env("PROBE_TOKEN=from-server-env-5822")
    result = run_cmd(["bash", sync, "render"], env=ctx.env())
    assert result.returncode == 0, result.output
    assert ctx.qwen()["mcpServers"]["probe-http"]["headers"]["Authorization"] == "Bearer from-server-env-5822"


def test_qwen_unresolvable_placeholder_is_kept_warned_about_and_does_not_fail_the_render(ctx, sync, run_cmd):
    """qwen: unresolvable placeholder is kept, warned about, and does not fail the render"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env())
    assert result.returncode == 0, result.output

    # Positiv-Anker zuerst: die Datei ist geschrieben.
    assert ctx.qwen_out.is_file()
    server = ctx.qwen()["mcpServers"]["probe-http"]
    assert server["httpUrl"] == "http://localhost:19999/mcp"
    assert server["headers"]["Authorization"] == "Bearer ${PROBE_TOKEN}"

    # Die Warnung nennt die Variable.
    result = run_cmd(["bash", sync, "render"], env=ctx.env())
    assert "PROBE_TOKEN" in result.output


def test_qwen_header_values_without_a_placeholder_pass_through_untouched(ctx, sync, run_cmd):
    """qwen: header values without a placeholder pass through untouched"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-5821"))
    assert result.returncode == 0, result.output
    assert ctx.qwen()["mcpServers"]["probe-http"]["headers"]["X-Static"] == "no-placeholder-here"


def test_qwen_settings_json_is_written_user_readable_only_because_it_carries_a_resolved_secret(ctx, sync, run_cmd):
    """qwen: settings.json is written user-readable only, because it carries a resolved secret"""
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-5821"))
    assert result.returncode == 0, result.output
    assert oct(ctx.qwen_out.stat().st_mode & 0o777)[2:] == "600"

    # Bestandsfall: chmod 600 gilt auch fuer eine bereits existierende Datei.
    os.chmod(ctx.qwen_out, 0o644)
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-5821"))
    assert result.returncode == 0, result.output
    assert oct(ctx.qwen_out.stat().st_mode & 0o777)[2:] == "600"


def test_qwen_settings_json_preserves_non_mcp_config_on_merge(ctx, sync, run_cmd):
    """qwen: settings.json preserves non-MCP config on merge"""
    ctx.qwen_out.write_text(
        '{\n  "modelProviders": [{"name": "test-provider"}],\n  "theme": "dark"\n}\n', encoding="utf-8"
    )
    result = run_cmd(["bash", sync, "render"], env=ctx.env(PROBE_TOKEN="env-value-5821"))
    assert result.returncode == 0, result.output

    data = ctx.qwen()
    assert data["modelProviders"][0]["name"] == "test-provider"
    assert data["theme"] == "dark"
    assert data["mcpServers"]["probe-http"]["headers"]["Authorization"] == "Bearer env-value-5821"
