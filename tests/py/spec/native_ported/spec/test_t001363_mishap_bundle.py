"""Native migration of tests/spec/t001363-mishap-bundle.bats."""

from pathlib import Path

import pytest


@pytest.fixture
def repo(repo_root: Path) -> Path:
    return repo_root


def test_t001363_agent_lock_reap_prunes_orphaned_git_worktree_admin_entries(repo):
    assert (repo / "scripts" / "agent-lock.sh").is_file()
    # [T900023] reap() liegt seit der S1-Aufteilung in scripts/agent-lock-reap.sh.
    files = sorted((repo / "scripts").glob("agent-lock*.sh"))
    hits = [f for f in files if "git worktree prune" in f.read_text(encoding="utf-8", errors="replace")]
    assert hits, "no 'git worktree prune' in scripts/agent-lock*.sh"


def test_t001363_dev_flow_execute_skill_step_0_creates_worktree_via_worktree_create(repo):
    skill = repo / ".claude" / "skills" / "dev-flow-execute" / "SKILL.md"
    assert skill.is_file()
    assert "worktree-create.sh" in skill.read_text(encoding="utf-8")


def test_t001363_git_crypt_guard_has_check_tracked_function_or_case(repo):
    guard = repo / "scripts" / "git-crypt-guard.sh"
    assert guard.is_file()
    assert "check-tracked" in guard.read_text(encoding="utf-8")
