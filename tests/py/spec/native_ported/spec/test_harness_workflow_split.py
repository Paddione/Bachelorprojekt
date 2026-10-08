"""Native migration of tests/spec/harness-workflow-split.bats."""

import fnmatch
import os
import re
from pathlib import Path

import pytest

FORBIDDEN = re.compile(r"AskUserQuestion|TodoWrite|subagent_type|Task tool")
OC_FLOW_LINKS = ["dev-flow-plan", "dev-flow-execute", "dev-flow-chore"]
OC_SKILLS = OC_FLOW_LINKS + ["opencode-git-workflow"]


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def _awk_dispatch_section(text: str) -> str:
    """awk '/<summary>Skill Dispatch Protocol/{f=1;next} f&&/<\\/details>/{f=0} f' AGENTS.md"""
    out, f = [], False
    for ln in text.splitlines():
        if re.search(r"<summary>Skill Dispatch Protocol", ln):
            f = True
            continue
        if f and re.search(r"</details>", ln):
            f = False
        if f:
            out.append(ln)
    return "\n".join(out)


@pytest.fixture
def repo(repo_root):
    return repo_root


def test_hws_1_flow_entries_are_registry_declared_projections_git_workflow_stays_native(run_cmd, repo):
    """HWS-1: flow entries are registry-declared projections; git-workflow stays native"""
    for s in OC_FLOW_LINKS:
        p = repo / ".opencode/skills" / s
        assert p.is_dir()
        assert (p / "SKILL.md").is_file()
        lines = _read(repo / "docs/agent-guide/registry/skills.yaml").splitlines()
        hit = False
        for i, ln in enumerate(lines):
            if re.fullmatch(r"  - id: " + re.escape(s), ln):
                window = lines[i:i + 19]  # Treffer plus 18 Folgezeilen (grep -A18)
                if any(re.search(r"path: \.opencode/skills/" + s, w) for w in window):
                    hit = True
        assert hit, f"registry-Eintrag fuer {s} ohne path: .opencode/skills/{s}"
    res = run_cmd(["node", "scripts/agent-skills/project.mjs", "--check"], cwd=repo)
    assert res.returncode == 0
    # Positiv-Anker zuerst, dann Negativ-Aussage.
    assert (repo / ".opencode/skills/dev-flow-plan").is_dir()
    leftover = [e.name for e in os.scandir(repo / ".opencode/skills")
                if fnmatch.fnmatchcase(e.name, "opencode-flow-*")]
    assert leftover == []
    assert (repo / ".opencode/skills/opencode-git-workflow/SKILL.md").is_file()
    assert not (repo / ".opencode/skills/opencode-git-workflow").is_symlink()


def test_hws_2_opencode_skills_carry_no_claude_only_tool_syntax(repo):
    """HWS-2: opencode skills carry no Claude-only tool syntax"""
    for s in OC_SKILLS:
        skill = repo / ".opencode/skills" / s / "SKILL.md"
        assert skill.is_file() and skill.stat().st_size > 0
        hits = [ln for ln in _read(skill).splitlines() if FORBIDDEN.search(ln)]
        assert hits == [], f"{s}: {hits}"


def test_hws_3_shared_sources_reference_both_harness_primitives_collectively(repo):
    """HWS-3: shared sources reference both harness primitives (collectively)"""
    assert "background-agents.ts" in _read(repo / ".claude/skills/dev-flow-plan/SKILL.md")
    assert "background-agents.ts" in _read(repo / ".claude/skills/dev-flow-execute/SKILL.md")
    found = False
    for root, _dirs, files in os.walk(repo / ".opencode/skills"):
        for name in files:
            if "worktree.ts" in _read(Path(root) / name):
                found = True
                break
        if found:
            break
    assert found


def test_hws_4_opencode_git_workflow_uses_the_git_crypt_safe_worktree_wrapper(repo):
    """HWS-4: opencode-git-workflow uses the git-crypt-safe worktree wrapper"""
    assert "scripts/worktree-create.sh" in _read(repo / ".opencode/skills/git-workflow/SKILL.md")


def test_hws_5_flow_skill_sources_hand_over_to_git_workflow(repo):
    """HWS-5: flow-skill sources hand over to git-workflow"""
    assert "git-workflow" in _read(repo / ".claude/skills/dev-flow-execute/SKILL.md")
    assert "git-workflow" in _read(repo / ".claude/skills/dev-flow-chore/SKILL.md")


def test_hws_8_agents_md_skill_dispatch_protocol_is_opencode_native(repo, run_cmd):
    """HWS-8: AGENTS.md Skill Dispatch Protocol is opencode-native"""
    section = _awk_dispatch_section(_read(repo / "AGENTS.md"))
    # Guard gegen die leere Extraktion.
    nonblank = [ln for ln in section.splitlines() if ln]
    assert len(nonblank) > 0
    assert not [ln for ln in section.splitlines() if FORBIDDEN.search(ln)]
    assert "background-agents.ts" in section
    assert "delegate" in section


def test_hws_9_tools_yaml_has_a_harness_field_on_every_entry(repo):
    """HWS-9: tools.yaml has a harness field on every entry"""
    lines = _read(repo / "docs/agent-guide/registry/tools.yaml").splitlines()
    ids = sum(1 for ln in lines if re.match(r"^- id:", ln))
    harnesses = sum(1 for ln in lines if re.match(r"^  harness:", ln))
    assert ids == harnesses


def test_hws_10_tools_yaml_carries_at_least_one_opencode_tagged_entry(repo):
    """HWS-10: tools.yaml carries at least one opencode-tagged entry"""
    text = _read(repo / "docs/agent-guide/registry/tools.yaml")
    assert re.search(r"^  harness:[ \t]*opencode", text, re.MULTILINE)


def test_hws_11_tools_map_md_renders_a_harness_column(repo):
    """HWS-11: tools-map.md renders a Harness column"""
    assert "| Harness |" in _read(repo / "docs/agent-guide/maps/tools-map.md")


def test_hws_12_agent_guide_registry_validates_harness_schema_included(run_cmd, repo):
    """HWS-12: agent-guide registry validates (harness schema included)"""
    res = run_cmd(["node", "scripts/agent-guide/validate.mjs"], cwd=repo)
    assert res.returncode == 0


def test_hws_14_host_antigravity_cli_carries_no_shadowing_dirty_plan_copy(repo):
    """HWS-14: host antigravity-cli carries no shadowing dirty plan-* copy"""
    ag = Path(os.path.expanduser("~")) / ".gemini/antigravity-cli"
    if not ag.is_dir():
        pytest.skip("antigravity-cli not installed on this machine")
    hits = []
    for root, _dirs, files in os.walk(ag):
        for name in files:
            full = os.path.join(root, name)
            if fnmatch.fnmatchcase(full, "*plan-*/SKILL.md") and FORBIDDEN.search(_read(Path(full))):
                hits.append(full)
    assert hits == []
