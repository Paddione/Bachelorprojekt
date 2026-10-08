"""Native migration of tests/spec/mcp-gateway/node-mcp-server-startup.bats."""

import json
import shutil
import subprocess
import time
from pathlib import Path

import pytest

INIT = ('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05",'
        '"capabilities":{},"clientInfo":{"name":"bats","version":"1"}}}')
LIST = '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'


@pytest.fixture(autouse=True)
def _require_node():
    if shutil.which("node") is None:
        pytest.skip("node nicht verfuegbar")


def mcp_stdio(server: Path, *frames: str):
    """Send frames to a stdio MCP server, keep stdin open 3s, return (returncode, stdout).

    Mirrors `{ printf frames; sleep 3; } | timeout 25 node server 2>/dev/null`.
    """
    proc = subprocess.Popen(
        ["node", str(server)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
    )
    try:
        for frame in frames:
            proc.stdin.write(frame + "\n")
        proc.stdin.flush()
        time.sleep(3)
        proc.stdin.close()
        out, _ = proc.communicate(timeout=25)
        return proc.returncode, out
    except subprocess.TimeoutExpired:
        proc.kill()
        out, _ = proc.communicate()
        return 124, out
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def test_ticket_mcp_node_antwortet_auf_initialize_kein_zirkelimport_deadlock(repo_root):
    """ticket-mcp-node antwortet auf initialize (kein Zirkelimport-Deadlock)"""
    status, output = mcp_stdio(repo_root / "scripts" / "ticket-mcp-node" / "server.mjs", INIT)
    assert status == 0, output
    assert '"id":1' in output
    assert '"result"' in output
    assert "ticket-mcp" in output


def test_ticket_mcp_node_liefert_eine_nicht_leere_tools_list(repo_root):
    """ticket-mcp-node liefert eine nicht-leere tools/list"""
    status, output = mcp_stdio(repo_root / "scripts" / "ticket-mcp-node" / "server.mjs", INIT, LIST)
    assert status == 0, output
    assert '"id":2' in output
    assert '"tools":[{' in output


def test_ticket_mcp_node_tools_list_enthaelt_kein_property_level_required_json_schema_konform(repo_root):
    """ticket-mcp-node tools/list enthaelt kein property-level required (JSON-Schema-konform)"""
    status, output = mcp_stdio(repo_root / "scripts" / "ticket-mcp-node" / "server.mjs", INIT, LIST)
    assert status == 0, output
    assert '"name":"create_ticket"' in output
    assert '"required":true' not in output


def test_ticket_mcp_node_tools_list_enthaelt_keine_doppelten_tool_namen_t900984(repo_root):
    """ticket-mcp-node tools/list enthaelt keine doppelten Tool-Namen (T900984)"""
    status, output = mcp_stdio(repo_root / "scripts" / "ticket-mcp-node" / "server.mjs", INIT, LIST)
    assert status == 0, output
    result_lines = [json.loads(line) for line in output.splitlines() if line.strip()]
    responses = [m for m in result_lines if m.get("id") == 2]
    tools = [t["name"] for m in responses for t in m["result"]["tools"]]
    dupes = {n for n in tools if tools.count(n) > 1}
    assert not dupes, dupes
    assert len(tools) == 26


def test_ticket_mcp_node_startet_auch_ueber_runner_mjs_ohne_argumente(repo_root):
    """ticket-mcp-node startet auch ueber runner.mjs ohne Argumente"""
    status, output = mcp_stdio(repo_root / "scripts" / "ticket-mcp-node" / "runner.mjs", INIT)
    assert status == 0, output
    assert '"result"' in output
    assert "ticket-mcp" in output


def test_ticket_mcp_node_runner_mjs_version_bleibt_ein_cli_pfad(repo_root, run_cmd):
    """ticket-mcp-node runner.mjs --version bleibt ein CLI-Pfad"""
    result = run_cmd(["timeout", "25", "node", str(repo_root / "scripts" / "ticket-mcp-node" / "runner.mjs"),
                      "--version"])
    assert result.returncode == 0, result.output
    assert "ticket-mcp-node version=" in result.output


def test_ticket_mcp_node_startet_auch_ausserhalb_eines_repos_find_repo_root_terminiert(repo_root, tmp_path):
    """ticket-mcp-node startet auch ausserhalb eines Repos (findRepoRoot terminiert)"""
    standalone = tmp_path / "standalone"
    standalone.mkdir()
    src = repo_root / "scripts" / "ticket-mcp-node"
    for name in ("server.mjs", "runner.mjs", "package.json"):
        shutil.copy(src / name, standalone / name)
    status, output = mcp_stdio(standalone / "server.mjs", INIT)
    assert status == 0, output
    assert '"result"' in output
