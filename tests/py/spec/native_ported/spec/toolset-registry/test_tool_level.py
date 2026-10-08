"""Native migration of tests/spec/toolset-registry/tool-level.bats."""
# [T900983]
# Tool level of the toolset chain. probe.mjs, check.mjs and toolset-context.sh are executed against
# fixtures; checks cover exit status, output and the written lock. Command output verification

# [T002448-M4]. Isolation: all TOOLSET_* paths point into tmp_path.

import json
import re

import pytest
import yaml

DEFAULT_TOOLS = (
    '[\n'
    '    {"name":"pods_list","description":"List pods","annotations":{"readOnlyHint":true}},\n'
    '    {"name":"pods_exec","description":"Exec in pod","annotations":{"destructiveHint":true}},\n'
    '    {"name":"resources_delete","description":"Delete resource","annotations":{"destructiveHint":true}},\n'
    '    {"name":"resources_get","description":"Get resource"}\n'
    '  ]'
)

LOCK_GONE = """lock_version: 2
servers:
  gone-server:
    status: ok
    tool_count: 1
    tools:
      old_tool: {hash: abc123}
"""

REGISTRY = """capabilities:
  cluster:
    mcp:fake-k8s:
      state: canonical
      use_when: "Cluster lesen"
      roles: [bp-run]
      tier: safe
      tool_tiers:
        pods_exec: dangerous
        "resources_*": caution
"""


class TL:
    def __init__(self, run_cmd, repo_root, tmp_path):
        self.run_cmd = run_cmd
        self.repo = repo_root
        self.fake = repo_root / "tests" / "spec" / "toolset-registry" / "fixtures" / "fake-mcp.mjs"
        self.t = tmp_path
        (tmp_path / "out" / ".claude").mkdir(parents=True)
        (tmp_path / "out" / ".claude" / "settings.json").write_text("{}\n", encoding="utf-8")
        self.mcp = tmp_path / "mcp.yaml"
        self.lock = tmp_path / "toolset.lock.yaml"
        self.registry = tmp_path / "capabilities.yaml"
        self.mcp.write_text(
            "clients:\n"
            "  fake-k8s:\n    transport: stdio\n    command: node\n"
            f"    args: [{self.fake}]\n"
            "  gone-server:\n    transport: stdio\n"
            "    command: /nonexistent/bin/gone-mcp\n    args: []\n",
            encoding="utf-8",
        )
        self.registry.write_text(REGISTRY, encoding="utf-8")
        self.env = {
            "TOOLSET_MCP_REGISTRY": str(self.mcp),
            "TOOLSET_LOCK": str(self.lock),
            "TOOLSET_REGISTRY": str(self.registry),
            "TOOLSET_OUT_DIR": str(tmp_path / "out"),
            "FAKE_MCP_TOOLS": DEFAULT_TOOLS,
        }

    def _run(self, script, *args):
        return self.run_cmd(["node", str(self.repo / "scripts" / "toolset" / script), *args],
                            cwd=self.repo, env=self.env)

    def probe(self, *args):
        return self._run("probe.mjs", *args)

    def check(self):
        return self._run("check.mjs")

    def ctx(self, *args):
        return self.run_cmd(["bash", str(self.repo / "scripts" / "toolset-context.sh"), *args],
                            cwd=self.repo, env=self.env)

    def lock_data(self):
        return yaml.safe_load(self.lock.read_text(encoding="utf-8"))


@pytest.fixture
def tl(run_cmd, repo_root, tmp_path):
    return TL(run_cmd, repo_root, tmp_path)


def test_tool_level_probe_schreibt_die_tools_eines_stdio_servers_in_den_lock(tl):
    res = tl.probe()
    assert res.returncode == 0
    server = tl.lock_data()["servers"]["fake-k8s"]
    assert server["status"] == "ok"
    assert server["tool_count"] == 4
    assert server["tools"]["pods_exec"]["destructive"] is True
    assert server["tools"]["pods_list"]["read_only"] is True


def test_tool_level_unerreichbarer_server_behaelt_seine_bisherigen_tools(tl):
    tl.lock.write_text(LOCK_GONE, encoding="utf-8")
    res = tl.probe()
    assert res.returncode == 0
    text = tl.lock.read_text(encoding="utf-8")
    assert "old_tool" in text
    assert "status: unreachable" in text


def test_tool_level_probe_ack_uebernimmt_den_gemessenen_stand_als_geprueft_und_probe_erhaelt_ihn(tl):
    assert tl.probe("--ack", "fake-k8s").returncode == 0
    assert tl.probe().returncode == 0
    reviewed = tl.lock_data()["servers"]["fake-k8s"].get("reviewed") or {}
    assert "reviewed=" + ",".join(sorted(reviewed)) == "reviewed=pods_exec,pods_list,resources_delete,resources_get"


def test_tool_level_check_meldet_neue_tools_als_unreviewed_ohne_zu_brechen(tl):
    tl.probe("--ack", "fake-k8s")
    tl.env["FAKE_MCP_TOOLS"] = (
        '[{"name":"pods_list","description":"List pods"},{"name":"pods_exec","description":"Exec in pod"},'
        '{"name":"resources_delete","description":"Delete resource"},{"name":"resources_get","description":"Get resource"},'
        '{"name":"nodes_drain","description":"Drain node"}]'
    )
    tl.probe()
    res = tl.check()
    assert res.returncode == 0
    assert "fake-k8s" in res.output
    assert "nodes_drain" in res.output
    assert "unreviewed" in res.output


def test_tool_level_tool_tiers_glob_ohne_passendes_tool_faellt_fail_closed(tl):
    tl.probe("--ack", "fake-k8s")
    assert tl.check().returncode == 0
    tl.registry.write_text(tl.registry.read_text(encoding="utf-8") + '        "helm_*": dangerous\n',
                           encoding="utf-8")
    res = tl.check()
    assert res.returncode != 0
    assert "helm_*" in res.output


def test_tool_level_ungueltiger_tier_in_tool_tiers_faellt_fail_closed(tl):
    tl.probe("--ack", "fake-k8s")
    tl.registry.write_text(tl.registry.read_text(encoding="utf-8").replace(
        "pods_exec: dangerous", "pods_exec: lethal"), encoding="utf-8")
    res = tl.check()
    assert res.returncode != 0
    assert "lethal" in res.output


def test_tool_level_check_warnt_bei_destructive_hint_auf_einem_safe_tool(tl):
    lines = [l for l in tl.registry.read_text(encoding="utf-8").splitlines(keepends=True)
             if "pods_exec: dangerous" not in l]
    tl.registry.write_text("".join(lines), encoding="utf-8")
    tl.probe("--ack", "fake-k8s")
    res = tl.check()
    assert res.returncode == 0
    assert "pods_exec" in res.output
    assert "destructiveHint" in res.output


def test_tool_level_werkzeug_block_nennt_riskante_tools_einzeln_und_zaehlt_den_rest(tl):
    tl.probe("--ack", "fake-k8s")
    res = tl.ctx("bp-run")
    assert res.returncode == 0
    out = res.output
    assert re.search(r"pods_exec.*dangerous", out, re.DOTALL)
    assert re.search(r"resources_delete.*caution", out, re.DOTALL)
    assert "+1 safe" in out
    # pods_list is safe and not enumerated individually.
    assert "pods_list" not in out


def test_tool_level_json_liefert_jedes_tool_mit_aufgeloestem_tier(tl):
    tl.probe("--ack", "fake-k8s")
    res = tl.ctx("bp-run", "--json")
    assert res.returncode == 0
    tools = json.loads(res.stdout)[0]["tools"]
    tiers = {t["name"]: t.get("tier") for t in tools}
    assert f"{tiers.get('pods_exec')} {tiers.get('resources_get')} {tiers.get('pods_list')}" == "dangerous caution safe"


def test_tool_level_doppelte_tool_namen_landen_im_lock_und_im_check_hinweis_t900984(tl):
    tl.env["FAKE_MCP_TOOLS"] = (
        '[{"name":"pods_list"},{"name":"pods_exec"},{"name":"pods_exec"},'
        '{"name":"resources_get"},{"name":"resources_delete"}]'
    )
    assert tl.probe("--ack", "fake-k8s").returncode == 0
    assert "duplicate_names" in tl.lock.read_text(encoding="utf-8")
    res = tl.check()
    assert res.returncode == 0
    assert re.search(r"twice.*pods_exec", res.output, re.DOTALL)
