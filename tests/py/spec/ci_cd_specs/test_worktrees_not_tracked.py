"""Native assertions from tests/spec/ci-cd/worktrees-not-tracked.bats."""

def test_git_ls_files_has_positive_anchor(run_cmd):
    result = run_cmd(["git", "ls-files", "scripts/"])
    result.check()
    assert result.output


def test_worktrees_have_no_tracked_files(run_cmd):
    test_git_ls_files_has_positive_anchor(run_cmd)
    result = run_cmd(["git", "ls-files", ".worktrees/"])
    result.check()
    assert not result.output


def test_worktrees_are_gitignored(run_cmd):
    run_cmd(["git", "check-ignore", "--no-index", "-q", ".worktrees/beliebiger-worktree/datei.md"]).check()
