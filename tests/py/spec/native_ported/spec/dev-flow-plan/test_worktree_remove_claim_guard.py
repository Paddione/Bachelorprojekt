"""Native migration of tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats."""
# T005115: worktree-clean-check.sh refuses worktrees with an active branch/ticket claim (rc 1).
# Command output verification [T002448-M4] for the script; the skill-text check is a documented

# cross-cutting exception (the result lives only in the document).

import json
import time

import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@test",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@test",
}


@pytest.fixture
def claim_env(run_cmd, repo_root, tmp_path):
    test_dir = tmp_path / "claim-guard-test"
    test_dir.mkdir()
    lock_dir = tmp_path / "agent-locks-claim-guard"
    lock_dir.mkdir()

    def git(*args):
        return run_cmd(["git", "-C", str(test_dir), *args], env=GIT_ENV)

    git("init", "-b", "main").check()
    (test_dir / "x.txt").write_text("x\n", encoding="utf-8")
    git("add", "x.txt").check()
    git("commit", "-q", "-m", "init").check()
    git("checkout", "-q", "-b", "feature/wt-T009888").check()
    return {
        "dir": test_dir,
        "lock_dir": lock_dir,
        "script": repo_root / "scripts" / "worktree-clean-check.sh",
        "repo": repo_root,
        "run": lambda: run_cmd(["bash", str(repo_root / "scripts" / "worktree-clean-check.sh"),
                                str(test_dir)], cwd=test_dir,
                               env={"AGENT_LOCK_DIR": str(lock_dir)}),
    }


def test_t005115_worktree_clean_check_lehnt_worktree_mit_aktivem_fremd_claim_ab(claim_env):
    test_dir, lock_dir = claim_env["dir"], claim_env["lock_dir"]

    # Positive anchor: without a claim the worktree is clean (rc=0).
    assert claim_env["run"]().returncode == 0

    # Foreign, live branch claim (foreign owner_sid, fresh heartbeat) -> rc=1.
    now = int(time.time())
    branch_lock = lock_dir / "branch__feature-wt-T009888.json"
    branch_lock.write_text(json.dumps({
        "scope": "branch", "id": "feature/wt-T009888", "owner_sid": "fremde-session-123",
        "owner_pid": 999999, "tool": "claude", "label": "dev-flow-plan",
        "worktree": str(test_dir), "branch": "feature/wt-T009888", "ticket": "",
        "host": "other", "created_at": now, "heartbeat_at": now,
    }) + "\n", encoding="utf-8")

    res = claim_env["run"]()
    assert res.returncode == 1
    assert "claim" in res.output.lower()

    branch_lock.unlink()

    # T014468: foreign, live ticket claim for the same worktree -> rc=1.
    (lock_dir / "ticket__T14468.json").write_text(json.dumps({
        "scope": "ticket", "id": "T14468", "owner_sid": "fremde-session-123",
        "owner_pid": 999999, "tool": "claude", "label": "dev-flow-plan",
        "worktree": str(test_dir), "branch": "feature/wt-T009888", "ticket": "T14468",
        "host": "other", "created_at": now, "heartbeat_at": now,
    }) + "\n", encoding="utf-8")

    res = claim_env["run"]()
    assert res.returncode == 1
    assert "ticket-scoped" in res.output.lower()

    # Cross-cutting exception: the skill text names the claim guard before a foreign remove.
    skill = claim_env["repo"] / ".claude" / "skills" / "dev-flow-plan" / "SKILL.md"
    lines = skill.read_text(encoding="utf-8").splitlines()
    assert sum(1 for l in lines if "worktree-clean-check.sh" in l) >= 1
    assert sum(1 for l in lines if "check branch" in l) >= 1
