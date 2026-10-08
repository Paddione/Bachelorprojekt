"""Tests for check-commit-vs-diff package drift guard (migrated from tests/unit/check-commit-vs-diff-package-drift.bats)."""

from pathlib import Path
import subprocess
import pytest


@pytest.fixture
def repo_sandbox(tmp_path: Path):
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo_dir, check=True)
    return repo_dir


def test_blocks_fix_with_opencode_package_json_drift(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): chain middleware sequence\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.ts").write_text("real code")
    opencode = repo_sandbox / ".opencode"
    opencode.mkdir()
    (opencode / "package.json").write_text('{"dependencies":{"@opencode-ai/plugin":"1.18.18"}}')

    subprocess.run(["git", "add", "src/", ".opencode/package.json"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode != 0
    assert "package.json" in res.stdout or "package.json" in res.stderr


def test_blocks_fix_with_opencode_lock_drift(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): chain middleware sequence\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.ts").write_text("real code")
    opencode = repo_sandbox / ".opencode"
    opencode.mkdir()
    (opencode / "package-lock.json").write_text('{"lockfileVersion":3}')

    subprocess.run(["git", "add", "src/", ".opencode/package-lock.json"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode != 0
    assert "package" in res.stdout or "package" in res.stderr


def test_allows_chore_deps_with_opencode_package(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("chore(deps): update @opencode-ai/plugin 1.18.16 -> 1.18.18\n")

    opencode = repo_sandbox / ".opencode"
    opencode.mkdir()
    (opencode / "package.json").write_text('{"dependencies":{"@opencode-ai/plugin":"1.18.18"}}')
    (opencode / "package-lock.json").write_text('{"lockfileVersion":3}')

    subprocess.run(["git", "add", ".opencode/"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0


def test_allows_normal_code_commit_without_opencode(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): chain middleware sequence\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.ts").write_text("real code")

    subprocess.run(["git", "add", "src/"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0
