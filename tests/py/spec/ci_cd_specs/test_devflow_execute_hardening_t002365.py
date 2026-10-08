"""Native assertions from tests/spec/ci-cd/devflow-execute-hardening-t002365.bats."""

import re
import pytest

@pytest.fixture
def skill(repo_root):
    return (repo_root / ".claude/skills/dev-flow-execute/SKILL.md").read_text()


def implementer_section(skill):
    return skill.split("## Schritt 2:", 1)[1].split("## Schritt 5:", 1)[0]


def test_implementer_orchestrator_split(skill):
    assert "Arbeitsteilung (T002365" in skill
    assert "bash scripts/devflow-ci-watch.sh" not in implementer_section(skill)


def test_ci_loop_owned_by_orchestrator(skill):
    assert re.search(r"^## Schritt 5.5: CI/CD-Fix-Schleife \(Orchestrator-Zuständigkeit", skill, re.M)


def test_conflict_handoff_uses_existing_implementer(skill):
    assert "Exit-Code" in skill
    assert skill.count("SendMessage") >= 2
    assert "kein neuer Spawn" in skill


def test_implementer_excludes_worktree_removal(repo_root, skill):
    section = implementer_section(skill)
    assert section
    handoff = (repo_root / ".claude/skills/dev-flow-execute/references/implementer-handoff.md").read_text()
    assert "wird nicht von dir entfernt" in (section + handoff).lower()


def test_skill_no_literal_worktree_remove(skill):
    assert "Worktree" in skill
    assert "git worktree remove" not in skill


def test_quick_reference_preflight_passes_pr_title(repo_root):
    source = (repo_root / ".claude/skills/references/git-workflow-procedures.md").read_text()
    assert "preflight-pr-scope.sh" in source
    assert not re.search(r'scripts/preflight-pr-scope\.sh`[^" ]', source)
    assert 'preflight-pr-scope.sh "<PR title>"' in source
