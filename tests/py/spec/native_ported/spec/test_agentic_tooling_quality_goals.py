"""Native migration of tests/spec/agentic-tooling-quality-goals.bats."""
import re
import subprocess
from pathlib import Path

import pytest


def _bp_agents(repo_root: Path):
    agents = sorted((repo_root / ".claude" / "agents").glob("bp-*.md"))
    assert agents, "no .claude/agents/bp-*.md files"
    return agents


def _frontmatter_lines(path: Path):
    return path.read_text(encoding="utf-8").splitlines()


def test_g_agentic03_every_claude_agents_md_has_a_name_field_in_frontmatter(repo_root):
    missing = [str(f) for f in _bp_agents(repo_root) if not any(
        re.search(r"^name:", line) for line in _frontmatter_lines(f))]
    assert not missing, f"MISSING name: in {missing}"


def test_g_agentic03_every_claude_agents_md_has_a_description_field_in_frontmatter(repo_root):
    missing = [str(f) for f in _bp_agents(repo_root) if not any(
        re.search(r"^description:", line) for line in _frontmatter_lines(f))]
    assert not missing, f"MISSING description: in {missing}"


def test_g_agentic03_agent_name_matches_filename_basename(repo_root):
    bad = []
    for f in _bp_agents(repo_root):
        name_lines = [line for line in _frontmatter_lines(f) if re.search(r"^name:", line)]
        name_val = re.sub(r"^name:[ \t]*", "", name_lines[0]) if name_lines else ""
        if name_val != f.stem:
            bad.append(f"{f}: name={name_val}, expected {f.stem}")
    assert not bad, "\n".join(bad)


def test_g_agentic02_agents_md_routing_table_mentions_all_3_agents(repo_root):
    text = (repo_root / "AGENTS.md").read_text(encoding="utf-8")
    missing = [agent for agent in ("bp-build", "bp-run", "bp-ship") if agent not in text]
    assert not missing, f"AGENTS.md missing routing entry for {missing}"


def test_g_agentic04_test_changed_bucket_for_claude_agents_includes_agent_library_bats(repo_root):
    text = (repo_root / "taskfiles" / "Taskfile.test.yml").read_text(encoding="utf-8")
    assert "agent-library" in text


def test_g_agentic05_exactly_3_agent_files_exist_under_claude_agents(repo_root):
    files = [p for p in (repo_root / ".claude" / "agents").rglob("bp-*.md")]
    assert len(files) == 3


def test_g_agentic09_zero_project_owned_skill_md_files_exceed_the_declared_limit(run_cmd, repo_root):
    script = (
        'source <(sed -n "/^project_owned_skills()/,/^}/p" scripts/health-goals-check.sh)\n'
        "c=0; for d in $(project_owned_skills); do\n"
        '  [ "$(wc -l < ".opencode/skills/$d/SKILL.md")" -gt 400 ] && c=$((c+1)); done; echo $c'
    )
    result = run_cmd(["bash", "-c", script], cwd=repo_root, timeout=300)
    result.check()
    assert result.stdout.strip() == "0"


def test_g_agentic09_is_declared_as_a_fail_closed_gate_not_an_advisory_target(repo_root):
    text = (repo_root / "scripts" / "health-goals-check.sh").read_text(encoding="utf-8")
    assert any(re.search(r"^row gate G-AGENTIC09 ", line) for line in text.splitlines())


def test_g_agentic09_measures_400_lines_not_the_legacy_500(repo_root):
    lines = (repo_root / "scripts" / "health-goals-check.sh").read_text(encoding="utf-8").splitlines()
    # grep -A3 '^row gate G-AGENTIC09 ': matching line plus 3 following lines.
    windows = [
        "\n".join(lines[idx : idx + 4])
        for idx, line in enumerate(lines)
        if re.search(r"^row gate G-AGENTIC09 ", line)
    ]
    output = "\n".join(windows)
    assert windows, "no G-AGENTIC09 row found"
    assert "-gt 400" in output
    assert "-gt 500" not in output


def test_project_owned_skills_derives_the_vendor_set_from_the_overview_md_marker_block(repo_root):
    lines = (repo_root / "scripts" / "health-goals-check.sh").read_text(encoding="utf-8").splitlines()
    windows = [
        "\n".join(lines[idx : idx + 4])
        for idx, line in enumerate(lines)
        if re.search(r"^project_owned_skills\(\)", line)
    ]
    assert windows, "no project_owned_skills() definition"
    assert "vendor-skills:begin" in "\n".join(windows)
