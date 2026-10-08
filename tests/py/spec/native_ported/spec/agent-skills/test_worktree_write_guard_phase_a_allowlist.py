"""Native migration of tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats."""

import os
import subprocess

import pytest

SID = "sid-phase-a-test"


@pytest.fixture
def ctx(run_cmd, repo_root, tmp_path):
    """BATS setup: Sandbox-Repo mit Phase-A-Pfaden und eigenem Lock auf wt-real."""
    bt = tmp_path / "bt"
    bt.mkdir()
    repo = bt / "repo"
    for d in ("wt-real", ".agents/plans/some-change", ".lavish", "scripts"):
        (repo / d).mkdir(parents=True)
    (repo / "wt-real/README.md").write_text("", encoding="utf-8")
    (repo / ".agents/plans/some-change/proposal.md").write_text("", encoding="utf-8")
    (repo / ".lavish/some-change-brainstorm.html").write_text("", encoding="utf-8")
    (repo / "scripts/foo.sh").write_text("", encoding="utf-8")

    run_cmd(["git", "init", "-b", "main"], cwd=repo).check()
    run_cmd(["git", "config", "user.email", "test@example.com"], cwd=repo).check()
    run_cmd(["git", "config", "user.name", "Test User"], cwd=repo).check()
    (repo / "README.md").write_text("", encoding="utf-8")
    run_cmd(["git", "add", "README.md"], cwd=repo).check()
    run_cmd(["git", "commit", "-m", "chore: init"], cwd=repo).check()

    locks = bt / "locks"
    locks.mkdir()
    (locks / "branch__feat-some-branch-T001111.json").write_text(
        '{"owner_sid":"%s","owner_pid":"1234","worktree":"%s/wt-real","branch":"feat/some-branch-T001111","label":"live"}\n'
        % (SID, repo),
        encoding="utf-8",
    )
    return {"repo": repo, "locks": locks, "guard": repo_root / "scripts/hooks/worktree-write-guard.sh"}


def _guard(c, target):
    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(c["locks"])
    env["SID"] = SID
    env["AGENT_LOCK_SID"] = SID
    payload = '{"tool_input":{"file_path":"%s"}}' % target
    return subprocess.run(
        ["bash", str(c["guard"])],
        input=payload + "\n",
        text=True,
        capture_output=True,
        cwd=str(c["repo"]),
        env=env,
        timeout=120,
    )


def test_allows_agents_plans_on_main_even_when_own_worktree_exists(ctx):
    target = str(ctx["repo"] / ".agents/plans/some-change/proposal.md")
    assert _guard(ctx, target).returncode == 0


def test_allows_lavish_on_main_even_when_own_worktree_exists(ctx):
    target = str(ctx["repo"] / ".lavish/some-change-brainstorm.html")
    assert _guard(ctx, target).returncode == 0


def test_rejects_non_phase_a_main_checkout_writes_when_own_worktree_exists(ctx):
    target = str(ctx["repo"] / "scripts/foo.sh")
    assert _guard(ctx, target).returncode == 2


def test_allows_writes_inside_own_claimed_worktree(ctx):
    target = str(ctx["repo"] / "wt-real/README.md")
    assert _guard(ctx, target).returncode == 0
