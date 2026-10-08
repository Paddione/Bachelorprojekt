"""Native migration of tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats."""

from pathlib import Path


def _repo(repo_root: Path) -> Path:
    return repo_root


def _mkagent(fixtures: Path, name: str, *tools: str) -> None:
    lines = ["---", f"name: {name}", "description: fixture"]
    if tools:
        lines.append("tools:")
        lines.extend(f"  - {t}" for t in tools)
    lines.append("---")
    lines.append("fixture body")
    (fixtures / f"{name}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _fixtures(tmp_path: Path) -> Path:
    fixtures = tmp_path / "agents"
    fixtures.mkdir(parents=True, exist_ok=True)
    return fixtures


def test_t002494_positiv_anker_agent_mit_gueltigen_builtins_und_mcp_zaehlt_0(repo_root, run_cmd, tmp_path):
    fixtures = _fixtures(tmp_path)
    registry = repo_root / "docs/agent-guide/registry/mcp.yaml"
    _mkagent(fixtures, "valid-agent", "Bash", "Read", "mcp__mcp-postgres__query")
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(fixtures), str(registry)])
    assert result.returncode == 0, result.output
    assert result.output == "0"


def test_t002494_positiv_anker_agent_ganz_ohne_tools_key_zaehlt_0_er_erbt_alle(repo_root, run_cmd, tmp_path):
    fixtures = _fixtures(tmp_path)
    registry = repo_root / "docs/agent-guide/registry/mcp.yaml"
    _mkagent(fixtures, "keyless-agent")
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(fixtures), str(registry)])
    assert result.returncode == 0, result.output
    assert result.output == "0"


def test_t002494_tools_key_der_zur_leeren_menge_resolvt_wird_gezaehlt(repo_root, run_cmd, tmp_path):
    fixtures = _fixtures(tmp_path)
    registry = repo_root / "docs/agent-guide/registry/mcp.yaml"
    (fixtures / "empty-agent.md").write_text(
        "---\nname: empty-agent\ndescription: fixture\ntools: []\n---\nbody\n", encoding="utf-8"
    )
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(fixtures), str(registry)])
    assert result.returncode == 0, result.output
    assert result.output == "1"


def test_t002494_falsch_geschriebener_mcp_name_der_t002221_bug_wird_gezaehlt(repo_root, run_cmd, tmp_path):
    fixtures = _fixtures(tmp_path)
    registry = repo_root / "docs/agent-guide/registry/mcp.yaml"
    _mkagent(fixtures, "legacy-bug-agent", "Bash", "mcp_postgres_query")
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(fixtures), str(registry)])
    assert result.returncode == 0, result.output
    assert result.output == "1"


def test_t002494_mcp_server_mit_unbekanntem_server_wird_gezaehlt(repo_root, run_cmd, tmp_path):
    fixtures = _fixtures(tmp_path)
    registry = repo_root / "docs/agent-guide/registry/mcp.yaml"
    _mkagent(fixtures, "ghost-server-agent", "Bash", "mcp__gibt-es-nicht__query")
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(fixtures), str(registry)])
    assert result.returncode == 0, result.output
    assert result.output == "1"


def test_t002494_mehrere_verstoesse_werden_aufsummiert_nicht_auf_1_gedeckelt(repo_root, run_cmd, tmp_path):
    fixtures = _fixtures(tmp_path)
    registry = repo_root / "docs/agent-guide/registry/mcp.yaml"
    _mkagent(fixtures, "ghost-a", "Bash", "mcp__gibt-es-nicht__query")
    _mkagent(fixtures, "ghost-b", "Bash", "mcp__auch-nicht__query")
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(fixtures), str(registry)])
    assert result.returncode == 0, result.output
    assert result.output == "2"


def test_t002494_der_reale_agentenbestand_erfuellt_das_gate_ziel_0(repo_root, run_cmd):
    registry = repo_root / "docs/agent-guide/registry/mcp.yaml"
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(repo_root / ".claude/agents"), str(registry)])
    assert result.returncode == 0, result.output
    assert result.output == "0"


def test_t002494_fehlende_registry_bricht_mit_rc_2_ab_statt_still_0(repo_root, run_cmd, tmp_path):
    fixtures = _fixtures(tmp_path)
    _mkagent(fixtures, "any-agent", "Bash")
    missing = repo_root / "docs/agent-guide/registry/gibt-es-nicht.yaml"
    result = run_cmd(["bash", str(repo_root / "scripts/lib/count-unresolved-agent-tools.sh"), str(fixtures), str(missing)])
    assert result.returncode == 2, result.output
