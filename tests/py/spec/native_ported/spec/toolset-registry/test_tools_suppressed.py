"""Native migration of tests/spec/toolset-registry/tools-suppressed.bats."""
# [T900985]
# Tool suppression (tools_suppressed). check.mjs, sync.mjs and toolset-context.sh run against

# fixtures under tmp_path. Command output verification [T002448-M4].

import json

import pytest

LOCK = """lock_version: 2
servers:
  fake-tickets:
    status: ok
    tool_count: 2
    tools:
      get_ticket: {hash: aaaaaaaaaaaa}
      stage_plan: {hash: bbbbbbbbbbbb}
    reviewed:
      get_ticket: aaaaaaaaaaaa
      stage_plan: bbbbbbbbbbbb
"""

REGISTRY = """capabilities:
  tickets:
    mcp:fake-tickets:
      state: canonical
      use_when: "Tickets lesen"
      roles: [bp-run]
      tier: caution
      tools_suppressed: [stage_plan]
"""

SETTINGS = """{
  "permissions": { "deny": ["Bash(rm -rf /:*)", "mcp__fake-tickets__old_tool"] },
  "disabledMcpjsonServers": []
}
"""


class TS:
    def __init__(self, run_cmd, repo_root, tmp_path):
        self.run_cmd = run_cmd
        self.repo = repo_root
        self.t = tmp_path
        (tmp_path / "out" / ".claude").mkdir(parents=True)
        self.registry = tmp_path / "capabilities.yaml"
        self.lock = tmp_path / "toolset.lock.yaml"
        self.out = tmp_path / "out"
        self.registry.write_text(REGISTRY, encoding="utf-8")
        self.lock.write_text(LOCK, encoding="utf-8")
        (self.out / ".mcp.json").write_text('{"mcpServers":{"fake-tickets":{"command":"node"}}}\n', encoding="utf-8")
        (self.out / ".claude" / "settings.json").write_text(SETTINGS, encoding="utf-8")
        self.env = {
            "TOOLSET_REGISTRY": str(self.registry),
            "TOOLSET_LOCK": str(self.lock),
            "TOOLSET_OUT_DIR": str(self.out),
        }

    def node(self, script):
        return self.run_cmd(["node", str(self.repo / "scripts" / "toolset" / script)],
                            cwd=self.repo, env=self.env)


@pytest.fixture
def ts(run_cmd, repo_root, tmp_path):
    return TS(run_cmd, repo_root, tmp_path)


def test_tools_suppressed_sync_setzt_permissions_deny_und_laesst_fremde_regeln_stehen(ts):
    res = ts.node("sync.mjs")
    assert res.returncode == 0
    deny = json.loads((ts.out / ".claude" / "settings.json").read_text(encoding="utf-8"))["permissions"]["deny"]
    output = ",".join(deny)
    assert "mcp__fake-tickets__stage_plan" in output
    assert "Bash(rm -rf /:*)" in output
    # Managed entries of a registry server that are no longer suppressed must disappear.
    assert "old_tool" not in output


def test_tools_suppressed_check_meldet_fehlende_durchsetzung_als_drift(ts):
    res = ts.node("check.mjs")
    assert res.returncode != 0
    assert "permissions.deny" in res.output
    ts.node("sync.mjs")
    assert ts.node("check.mjs").returncode == 0


def test_tools_suppressed_glob_ohne_treffer_faellt_fail_closed(ts):
    ts.registry.write_text(
        ts.registry.read_text(encoding="utf-8").replace(
            "tools_suppressed: [stage_plan]", 'tools_suppressed: [stage_plan, "helm_*"]'),
        encoding="utf-8",
    )
    ts.node("sync.mjs")
    res = ts.node("check.mjs")
    assert res.returncode != 0
    assert "helm_*" in res.output


def test_tools_suppressed_der_werkzeug_block_laesst_unterdrueckte_tools_weg(ts, repo_root):
    res = ts.run_cmd(["bash", str(repo_root / "scripts" / "toolset-context.sh"), "bp-run", "--json"],
                     cwd=repo_root, env=ts.env)
    assert res.returncode == 0
    data = json.loads(res.output)
    names = ",".join(t["name"] for t in data[0]["tools"])
    # Positive anchor: the non-suppressed tool is there.
    assert "get_ticket" in names
    assert "stage_plan" not in names
