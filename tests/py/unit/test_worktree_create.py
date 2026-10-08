"""Tests for scripts/worktree-create.sh (migrated from tests/unit/worktree-create.bats)."""

import os
from pathlib import Path
import subprocess
import pytest


@pytest.fixture
def fake_git_crypt_env(tmp_path: Path):
    home = tmp_path / "home"
    home.mkdir()
    gitconfig = home / ".gitconfig"
    gitconfig.touch()

    fake = tmp_path / "fake-git-crypt.sh"
    fake.write_text(
        "#!/usr/bin/env bash\n"
        'gd="${GIT_DIR:-$(git rev-parse --absolute-git-dir 2>/dev/null)}"\n'
        'if [ ! -f "$gd/git-crypt/keys/default" ]; then\n'
        '  echo "fake-git-crypt: Error: Unable to open key file" >&2\n'
        "  exit 1\n"
        "fi\n"
        "cat\n"
    )
    fake.chmod(0o755)

    main = tmp_path / "main"
    main.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(main)], check=True)
    subprocess.run(["git", "-C", str(main), "config", "user.email", "t@example.com"], check=True)
    subprocess.run(["git", "-C", str(main), "config", "user.name", "Tester"], check=True)
    subprocess.run(["git", "-C", str(main), "config", "filter.git-crypt.smudge", f"{fake} smudge"], check=True)
    subprocess.run(["git", "-C", str(main), "config", "filter.git-crypt.clean", f"{fake} clean"], check=True)
    subprocess.run(["git", "-C", str(main), "config", "filter.git-crypt.required", "true"], check=True)

    (main / ".gitattributes").write_text("secret/** filter=git-crypt diff=git-crypt\n")
    (main / "secret").mkdir()
    (main / "secret" / "data.yaml").write_text("TOPSECRET-VALUE\n")

    key_dir = main / ".git" / "git-crypt" / "keys"
    key_dir.mkdir(parents=True)
    (key_dir / "default").write_text("FAKEKEY\n")

    subprocess.run(["git", "-C", str(main), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(main), "commit", "-qm", "init"], check=True)

    env = os.environ.copy()
    env["HOME"] = str(home)
    env["GIT_CONFIG_GLOBAL"] = str(gitconfig)
    env["WT_SKIP_NAME_CHECK"] = "1"

    return main, fake, env


def test_plain_git_worktree_fails_on_git_crypt(fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    res = subprocess.run(
        ["git", "-C", str(main), "worktree", "add", "-b", "bare", str(tmp_path / "wt-bare"), "HEAD"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert res.returncode != 0
    assert "key file" in (res.stdout + res.stderr).lower()


def test_helper_script_exists_and_executable(repo_root: Path):
    helper = repo_root / "scripts" / "worktree-create.sh"
    assert helper.is_file()
    assert os.access(helper, os.X_OK)


def test_helper_creates_usable_worktree_unlocked(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt_ok = tmp_path / "wt-ok"

    res = subprocess.run(
        ["bash", str(helper), "feature/x", str(wt_ok), "HEAD"],
        cwd=main,
        capture_output=True,
        text=True,
        env=env,
    )
    assert res.returncode == 0
    assert (wt_ok / "secret" / "data.yaml").is_file()
    assert "TOPSECRET-VALUE" in (wt_ok / "secret" / "data.yaml").read_text()

    branch = subprocess.run(
        ["git", "-C", str(wt_ok), "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert "feature/x" in branch.stdout


def test_followup_git_status_succeeds(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt_y = tmp_path / "wt-y"

    subprocess.run(["bash", str(helper), "feature/y", str(wt_y), "HEAD"], cwd=main, env=env, check=True)
    res = subprocess.run(["git", "-C", str(wt_y), "status", "--porcelain"], capture_output=True, text=True, env=env)
    assert res.returncode == 0


def test_unlocked_worktree_filter_configs(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt = tmp_path / "wt-f1"

    subprocess.run(["bash", str(helper), "fix/friction1", str(wt), "HEAD"], cwd=main, env=env, check=True)

    # clean has NO worktree-local override
    res_clean = subprocess.run(
        ["git", "-C", str(wt), "config", "--worktree", "filter.git-crypt.clean"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert res_clean.returncode != 0

    # required is true
    res_req = subprocess.run(
        ["git", "-C", str(wt), "config", "--worktree", "filter.git-crypt.required"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert res_req.returncode == 0
    assert res_req.stdout.strip() == "true"


def test_commit_managed_file_succeeds_in_unlocked_worktree(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt = tmp_path / "wt-f1c"

    subprocess.run(["bash", str(helper), "fix/f1c", str(wt), "HEAD"], cwd=main, env=env, check=True)
    with open(wt / "secret" / "data.yaml", "a") as f:
        f.write("modified\n")

    res = subprocess.run(
        ["git", "-C", str(wt), "commit", "-am", "test: modify git-crypt-managed file"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert res.returncode == 0


def test_locked_repo_creates_usable_worktree(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt = tmp_path / "wt-z"

    (main / ".git" / "git-crypt" / "keys" / "default").unlink()
    res = subprocess.run(["bash", str(helper), "fix/z", str(wt), "HEAD"], cwd=main, env=env, capture_output=True, text=True)
    assert res.returncode == 0
    assert wt.is_dir()

    res_st = subprocess.run(["git", "-C", str(wt), "status", "--porcelain"], capture_output=True, text=True, env=env)
    assert res_st.returncode == 0


def test_fresh_worktree_resolves_node_modules_from_base(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt = tmp_path / "wt-nm"

    nm = main / "node_modules" / "cheerio"
    nm.mkdir(parents=True)
    (nm / "package.json").write_text('{"name":"cheerio"}\n')

    res = subprocess.run(["bash", str(helper), "feature/nm", str(wt), "HEAD"], cwd=main, env=env, capture_output=True, text=True)
    assert res.returncode == 0
    assert (wt / "node_modules" / "cheerio" / "package.json").exists()


def test_node_modules_skipped_when_base_has_none(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt = tmp_path / "wt-nonm"

    assert not (main / "node_modules").exists()
    res = subprocess.run(["bash", str(helper), "feature/nonm", str(wt), "HEAD"], cwd=main, env=env, capture_output=True, text=True)
    assert res.returncode == 0
    assert not (wt / "node_modules").exists()


def test_broken_smudge_fails_loud_and_rolls_back(repo_root: Path, fake_git_crypt_env, tmp_path: Path):
    main, _, env = fake_git_crypt_env
    helper = repo_root / "scripts" / "worktree-create.sh"
    wt = tmp_path / "wt-smudge"

    subprocess.run(["git", "-C", str(main), "config", "filter.git-crypt.smudge", "false"], check=True)
    res = subprocess.run(["bash", str(helper), "fix/smudge-broken", str(wt), "HEAD"], cwd=main, env=env, capture_output=True, text=True)
    assert res.returncode != 0
    assert not wt.exists()
