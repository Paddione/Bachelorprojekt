"""Native migration of tests/spec/worktree-divergence-guard-T002387.bats."""

def test_worktree_create_sh_uses_safe_fetch_that_avoids_local_main_ref_update(repo_root):
    script = repo_root / "scripts" / "worktree-create.sh"
    assert script.is_file()
    assert "refs/remotes/origin/main" in script.read_text(encoding="utf-8")


def test_worktree_create_sh_no_longer_uses_unsafe_git_fetch_origin_main_main(repo_root):
    script = repo_root / "scripts" / "worktree-create.sh"
    assert script.is_file()
    assert "git fetch origin main:main" not in script.read_text(encoding="utf-8")
