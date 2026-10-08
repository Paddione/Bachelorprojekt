"""Native migration of tests/spec/worktree-cross-platform.bats."""

# (T900046)

import subprocess

import pytest


@pytest.fixture
def sandbox(repo_root, tmp_path):
    return {"root": repo_root, "safe_prune": str(repo_root / "scripts/lib/worktree-prune-safe.sh"),
            "wt_create": repo_root / "scripts/worktree-create.sh", "sandbox": tmp_path}


def _init_repo(path):
    path.mkdir(parents=True)
    for args in (["init", "-q", "-b", "main"], ["config", "user.email", "test@example.com"],
                 ["config", "user.name", "Test"], ["commit", "-q", "--allow-empty", "-m", "initial"]):
        subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True)


def test_worktree_prune_safe_library_loads_and_returns_0(run_cmd, sandbox):
    r = run_cmd(["bash", "-c", f"source '{sandbox['safe_prune']}'\nworktree_prune_safe\n"], cwd=sandbox["root"])
    assert r.returncode == 0


def test_worktree_prune_safe_locked_worktree_is_never_pruned(run_cmd, sandbox):
    main_repo = sandbox["sandbox"] / "main"
    _init_repo(main_repo)
    wt_dir = sandbox["sandbox"] / "wt-locked"
    subprocess.run(["git", "-C", str(main_repo), "worktree", "add", "-q", "-b", "locked-branch", str(wt_dir), "main"],
                   check=True, capture_output=True)
    subprocess.run(["git", "-C", str(main_repo), "worktree", "lock", str(wt_dir), "--reason", "test lock"],
                   check=True, capture_output=True)

    r = run_cmd(["bash", "-c", f"cd '{main_repo}' && source '{sandbox['safe_prune']}' && worktree_prune_safe"],
                cwd=sandbox["root"])
    assert r.returncode == 0
    assert (main_repo / ".git" / "worktrees" / "wt-locked").is_dir()
    assert (main_repo / ".git" / "worktrees" / "wt-locked" / "locked").is_file()


def test_worktree_prune_safe_protects_cross_platform_windows_worktree_from_wsl_prune(run_cmd, sandbox):
    main_repo = sandbox["sandbox"] / "main-cross"
    _init_repo(main_repo)
    wt_dir = sandbox["sandbox"] / "wt-cross"
    subprocess.run(["git", "-C", str(main_repo), "worktree", "add", "-q", "-b", "cross-branch", str(wt_dir), "main"],
                   check=True, capture_output=True)
    admin_dir = main_repo / ".git" / "worktrees" / "wt-cross"
    assert admin_dir.is_dir()
    (admin_dir / "gitdir").write_text(f"{wt_dir}/.git\n")

    r = run_cmd(["bash", "-c",
                 f"cd '{main_repo}' && source '{sandbox['safe_prune']}' && WSL_DISTRO_NAME=Ubuntu worktree_prune_safe"],
                cwd=sandbox["root"])
    assert r.returncode == 0


def test_worktree_create_sh_locks_newly_created_worktree(run_cmd, sandbox):
    main_repo = sandbox["sandbox"] / "main-create"
    _init_repo(main_repo)
    subprocess.run(["git", "-C", str(main_repo), "branch", "origin/main", "main"], check=True, capture_output=True)

    (main_repo / "scripts" / "lib").mkdir(parents=True)
    root = sandbox["root"]
    (main_repo / "scripts" / "worktree-create.sh").write_bytes(sandbox["wt_create"].read_bytes())
    (main_repo / "scripts" / "lib" / "worktree-prune-safe.sh").write_bytes(
        (root / "scripts/lib/worktree-prune-safe.sh").read_bytes())
    guard = root / "scripts" / "worktree-git-op-guard.sh"
    if guard.is_file():
        (main_repo / "scripts" / "worktree-git-op-guard.sh").write_bytes(guard.read_bytes())
    allow = root / "scripts" / "lib" / "branch-allowlist.sh"
    if allow.is_file():
        (main_repo / "scripts" / "lib" / "branch-allowlist.sh").write_bytes(allow.read_bytes())

    wt_path = sandbox["sandbox"] / "created-wt"
    r = run_cmd(["bash", "-c", f"cd '{main_repo}' && WT_SKIP_NAME_CHECK=1 bash scripts/worktree-create.sh test-branch '{wt_path}' main"])
    assert r.returncode == 0
    assert (main_repo / ".git" / "worktrees" / wt_path.name / "locked").is_file()
