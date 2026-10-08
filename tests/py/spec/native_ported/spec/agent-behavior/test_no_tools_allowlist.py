"""Native migration of tests/spec/agent-behavior/no-tools-allowlist.bats."""

import re
import shutil

import pytest


def test_t002651_kein_domain_agent_fuehrt_eine_tools_allowlist(repo_root):
    found = 0
    offenders = []
    for agent in sorted((repo_root / ".claude" / "agents").glob("bp-*.md")):
        found += 1
        if re.search(r"^tools:([ \t]*$|[ \t]*\[)", agent.read_text(encoding="utf-8"), re.M):
            offenders.append(agent.name)
    assert found >= 3, f"Positiv-Anker fehlgeschlagen: nur {found} Agent-Definitionen gefunden (erwartet >= 6)"
    assert not offenders, f"Agents mit tools:-Allowlist (entzieht MCP und Skills): {' '.join(offenders)}"


def test_t002651_agents_yaml_fuehrt_fuer_keine_rolle_einen_tools_eintrag(run_cmd, repo_root):
    if shutil.which("node") is None:
        pytest.skip("node nicht verfuegbar")
    script = (
        "const y = require('yaml');\n"
        "const fs = require('fs');\n"
        "const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));\n"
        "const roles = d.roles || {};\n"
        "const names = Object.keys(roles);\n"
        "if (names.length < 3) {\n"
        "  console.log('ANCHOR_FAIL: nur ' + names.length + ' roles in der Registry');\n"
        "  process.exit(1);\n"
        "}\n"
        "const withTools = names.filter(n => roles[n] && roles[n].tools !== undefined);\n"
        "if (withTools.length) {\n"
        "  console.log('TOOLS_ENTRY: ' + withTools.join(' '));\n"
        "  process.exit(1);\n"
        "}\n"
        "console.log('OK: ' + names.length + ' roles ohne tools-Eintrag');\n"
    )
    r = run_cmd(["node", "-e", script], cwd=repo_root)
    assert r.returncode == 0, r.output
    assert re.search(r"^OK:", r.output, re.M)
