"""Tests for scripts/preflight-pr-scope.sh (migrated from tests/unit/preflight-pr-scope.bats)."""

from pathlib import Path
import subprocess
import pytest


@pytest.fixture
def pr_fixture_repo(tmp_path: Path):
    repo_dir = tmp_path / "fixture"
    repo_dir.mkdir()
    subprocess.run(["git", "-C", str(repo_dir), "init", "-q", "-b", "test-fixture"], check=True)
    subprocess.run(["git", "-C", str(repo_dir), "config", "user.email", "test@example.invalid"], check=True)
    subprocess.run(["git", "-C", str(repo_dir), "config", "user.name", "Test Fixture"], check=True)
    subprocess.run(["git", "-C", str(repo_dir), "commit", "-q", "--allow-empty", "-m", "fixture"], check=True)
    return repo_dir


def test_valid_scope_exits_0(repo_root: Path, run_cmd, pr_fixture_repo: Path):
    helper = repo_root / "scripts" / "preflight-pr-scope.sh"
    res = run_cmd(["bash", str(helper), "feat(website): add dashboard"], cwd=pr_fixture_repo)
    assert res.returncode == 0


def test_invalid_scope_exits_nonzero_with_help(repo_root: Path, run_cmd, pr_fixture_repo: Path):
    helper = repo_root / "scripts" / "preflight-pr-scope.sh"
    res = run_cmd(["bash", str(helper), "feat(cockpit): add view"], cwd=pr_fixture_repo)
    assert res.returncode != 0
    assert "NOT in the semantic-PR allowlist" in res.stdout or "NOT in the semantic-PR allowlist" in res.stderr
    assert "website" in res.stdout or "website" in res.stderr


def test_scopeless_title_exits_0(repo_root: Path, run_cmd, pr_fixture_repo: Path):
    helper = repo_root / "scripts" / "preflight-pr-scope.sh"
    res = run_cmd(["bash", str(helper), "docs: update readme"], cwd=pr_fixture_repo)
    assert res.returncode == 0
    out = (res.stdout + res.stderr).lower()
    assert "no scope" in out


def test_domain_scope_ops_recognized(repo_root: Path, run_cmd, pr_fixture_repo: Path):
    helper = repo_root / "scripts" / "preflight-pr-scope.sh"
    res = run_cmd(["bash", str(helper), "fix(ops): restart pod"], cwd=pr_fixture_repo)
    assert res.returncode == 0


def test_scope_with_breaking_change_marker(repo_root: Path, run_cmd, pr_fixture_repo: Path):
    helper = repo_root / "scripts" / "preflight-pr-scope.sh"
    res = run_cmd(["bash", str(helper), "feat(db)!: breaking schema"], cwd=pr_fixture_repo)
    assert res.returncode == 0


def test_ticket_branch_mismatch_suggests_rename(repo_root: Path, run_cmd, pr_fixture_repo: Path):
    helper = repo_root / "scripts" / "preflight-pr-scope.sh"
    res = run_cmd(["bash", str(helper), "chore(dev-flow): some chore [T001901]"], cwd=pr_fixture_repo)
    assert res.returncode != 0
    out = res.stdout + res.stderr
    assert "does not match current branch" in out
    assert "git branch -m" in out
    assert "T001917" in out


def test_fix_branch_under_worktrees_accepted(repo_root: Path, run_cmd, pr_fixture_repo: Path):
    helper = repo_root / "scripts" / "preflight-pr-scope.sh"
    wtree = pr_fixture_repo / ".worktrees" / "fix-example"
    wtree.parent.mkdir(exist_ok=True)
    subprocess.run(
        ["git", "-C", str(pr_fixture_repo), "worktree", "add", "-q", "-b", "fix/example", str(wtree), "test-fixture"],
        check=True,
    )
    res = run_cmd(["bash", str(helper), "fix(ops): example"], cwd=wtree)
    assert res.returncode == 0
