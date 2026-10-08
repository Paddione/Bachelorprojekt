"""Native migration of tests/spec/toolset-registry/lock-summary.bats."""
# [T900985]
# probe.mjs runs against the fake MCP server; the summary field written to the lock is checked.

# Command output verification [T002448-M4].

import json


def test_lock_summary_probe_schreibt_die_erste_beschreibungszeile_gekuerzt_auf_200_zeichen(run_cmd, repo_root, tmp_path):
    fake_server = repo_root / "tests" / "spec" / "toolset-registry" / "fixtures" / "fake-mcp.mjs"
    mcp_registry = tmp_path / "mcp.yaml"
    mcp_registry.write_text(
        "clients:\n  fake:\n    transport: stdio\n    command: node\n"
        f"    args: [{fake_server}]\n",
        encoding="utf-8",
    )
    lock = tmp_path / "toolset.lock.yaml"
    tools = [
        {"name": "pods_log", "description": "Read the logs of a pod.\nSecond line is dropped."},
        {"name": "big", "description": "x" * 300},
    ]
    env = {
        "TOOLSET_MCP_REGISTRY": str(mcp_registry),
        "TOOLSET_LOCK": str(lock),
        "FAKE_MCP_TOOLS": json.dumps(tools),
    }
    res = run_cmd(["node", str(repo_root / "scripts" / "toolset" / "probe.mjs")], env=env)
    assert res.returncode == 0

    js = (
        'const y=require(process.argv[1]); const l=y.load(require("fs").readFileSync(process.env.TOOLSET_LOCK,"utf8"));'
        "const t=l.servers.fake.tools; console.log(t.pods_log.summary + \"|\" + t.big.summary.length);"
    )
    res = run_cmd(["node", "-e", js, str(repo_root / "node_modules" / "js-yaml")], env=env)
    assert res.stdout.strip() == "Read the logs of a pod.|200"
