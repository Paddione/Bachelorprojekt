"""Native migration of tests/spec/warden-mcp/config-guards.bats."""

# [T900404]

import json
import re
import shutil

import pytest

MUTATING_TOOLS = [
    "create_attachment", "create_card", "create_folder", "create_identity", "create_login",
    "create_logins", "create_note", "create_org_collection", "create_ssh_key",
    "delete_attachment", "delete_folder", "delete_item", "delete_items", "delete_org_collection",
    "edit_folder", "edit_org_collection", "move_item_to_organization", "restore_item",
    "send_create", "send_create_encoded", "send_delete", "send_edit", "send_remove_password",
    "set_login_uris", "update_item",
]

REGISTRY_JS = """
    const c = require('yaml').parse(require('fs').readFileSync('docs/agent-guide/registry/mcp.yaml', 'utf8')).clients.warden || {};
    const v = { transport: c.transport, harnesses: Object.keys(c.harness || {}).join(',') }[process.argv[1]];
    process.stdout.write(String(v));
"""


@pytest.fixture(autouse=True)
def _need_jq():
    if shutil.which("jq") is None:
        pytest.skip("jq binary not installed")


def _registry(run_cmd, repo_root, field):
    return run_cmd(["node", "-e", REGISTRY_JS, field], cwd=repo_root)


def _compact(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def test_config_guards_mcp_json_starts_warden_only_through_the_launcher_without_credentials(repo_root):
    doc = json.loads((repo_root / ".mcp.json").read_text(encoding="utf-8"))
    out = _compact(doc["mcpServers"]["warden"])
    assert out == '{"command":"node","args":["scripts/warden-mcp/launch.mjs"]}'
    assert "BW_" not in out
    assert "${" not in out


def test_config_guards_registry_pins_warden_to_stdio_and_the_two_approved_harnesses(run_cmd, repo_root):
    check = run_cmd(["node", "-e", "require('yaml')"], cwd=repo_root)
    if check.returncode != 0:
        pytest.skip("node module yaml not resolvable")
    res = _registry(run_cmd, repo_root, "transport")
    assert res.returncode == 0, res.output
    assert res.output == "stdio"
    res = _registry(run_cmd, repo_root, "harnesses")
    assert res.returncode == 0, res.output
    assert res.output == "claude_code,opencode"
    launch = (repo_root / "scripts/warden-mcp/launch.mjs").read_text(encoding="utf-8")
    assert len(re.findall(r"@icoretech/warden-mcp@0\.2\.44", launch)) >= 1


def test_config_guards_opencode_renders_warden_through_the_launcher_llama_cpp_config_stays_without_it(repo_root):
    oc = (repo_root / ".opencode/opencode.jsonc").read_text(encoding="utf-8")
    assert sum(1 for l in oc.splitlines() if '"context7"' in l) >= 1

    lines = oc.splitlines()
    windows = []
    for i, line in enumerate(lines):
        if '"warden": {' in line:
            windows.append("\n".join(lines[i:i + 7]))
    assert windows, "grep -A6 '\"warden\": {' ohne Treffer"
    block = "\n".join(windows)
    assert '"type": "local"' in block
    assert '"command": ["node","scripts/warden-mcp/launch.mjs"]' in block
    assert '"enabled": true' in block
    assert "BW_" not in block

    llm = repo_root / "scripts/llm/mcp-servers.json"
    llm_text = llm.read_text(encoding="utf-8")
    assert sum(1 for l in llm_text.splitlines() if '"context7"' in l) >= 1
    assert sum(1 for l in llm_text.splitlines() if '"warden"' in l) == 0


def test_config_guards_every_mutating_warden_tool_asks_for_confirmation_in_both_harness_configs(run_cmd, repo_root):
    settings_path = repo_root / ".claude/settings.json"
    oc_path = repo_root / ".opencode/opencode.jsonc"
    oc = oc_path.read_text(encoding="utf-8")
    settings = json.loads(settings_path.read_text(encoding="utf-8"))
    ask = (settings.get("permissions") or {}).get("ask") or []

    found = 0
    for tool in MUTATING_TOOLS:
        name = f"mcp__warden__keychain_{tool}"
        assert name in ask, f"missing ask rule (claude_code): {tool}"
        count = sum(1 for l in oc.splitlines() if f'"warden_keychain_{tool}": "ask"' in l)
        assert count == 1, f"missing ask rule (opencode): {tool}"
        found += 1
    assert found == 25

    allow = (settings.get("permissions") or {}).get("allow") or []
    warden_allow = [a for a in allow if a.startswith("mcp__warden") or a == "mcp__*"]
    assert len(warden_allow) == 0
    assert sum(1 for l in oc.splitlines() if re.search(r'"warden_keychain_[a-z_]+": "(allow|deny)"', l)) == 0
