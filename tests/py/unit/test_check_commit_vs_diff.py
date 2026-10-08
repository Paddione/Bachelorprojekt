"""Tests for scripts/check-commit-vs-diff.sh (migrated from tests/unit/check-commit-vs-diff.bats)."""

import os
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


def test_script_exists_and_executable(repo_root: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    assert script.is_file()
    assert os.access(script, os.X_OK)


def test_allows_production_code_change(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): update middleware logic\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.ts").write_text("real code")
    subprocess.run(["git", "add", "src/middleware.ts"], cwd=repo_sandbox, check=True)

    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0


def test_allows_production_and_test_combined(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): chain middleware sequence\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.ts").write_text("real")
    (src / "middleware.test.ts").write_text("test")
    subprocess.run(["git", "add", "src/"], cwd=repo_sandbox, check=True)

    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0


def test_allows_red_test_with_test_prefix(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("test(red): verify locals.requestLogger is set\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.test.ts").write_text("test")
    subprocess.run(["git", "add", "src/"], cwd=repo_sandbox, check=True)

    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0


def test_allows_plan_only_with_chore_prefix(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("chore(plans): stage t001434 for execution [T001434]\n")

    plans = repo_sandbox / ".agents" / "plans" / "t001434"
    plans.mkdir(parents=True)
    (plans / "tasks.md").write_text("plan")
    subprocess.run(["git", "add", ".agents/plans/"], cwd=repo_sandbox, check=True)

    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0


def test_allows_docs_and_ci(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"

    # docs
    msg_file.write_text("docs: update README\n")
    (repo_sandbox / "README.md").write_text("hello")
    subprocess.run(["git", "add", "README.md"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0

    # ci
    subprocess.run(["git", "reset", "--hard"], cwd=repo_sandbox, check=True)
    msg_file.write_text("ci: bump action versions\n")
    wf = repo_sandbox / ".github" / "workflows"
    wf.mkdir(parents=True)
    (wf / "ci.yml").write_text("on: push")
    subprocess.run(["git", "add", ".github/"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0


def test_allows_manifest_as_production_code(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): tweak configmap\n")

    k3d = repo_sandbox / "k3d"
    k3d.mkdir()
    (k3d / "configmap-domains.yaml").write_text("data:")
    subprocess.run(["git", "add", "k3d/"], cwd=repo_sandbox, check=True)

    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode == 0


def test_blocks_t001434_pattern_red_only_test(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.test.ts").write_text("test")
    subprocess.run(["git", "add", "src/"], cwd=repo_sandbox, check=True)

    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode != 0
    assert "T001434 mishap pattern" in res.stdout or "T001434 mishap pattern" in res.stderr
    assert "test(red):" in res.stdout or "test(red):" in res.stderr


def test_blocks_plan_and_spec_only_with_fix_or_feat(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    msg_file = tmp_path / "msg-subject"

    # plan only
    msg_file.write_text("fix(infra): chain middleware\n")
    plans = repo_sandbox / ".agents" / "plans" / "x"
    plans.mkdir(parents=True)
    (plans / "tasks.md").write_text("plan")
    subprocess.run(["git", "add", ".agents/plans/"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode != 0

    # spec only
    subprocess.run(["git", "reset", "--hard"], cwd=repo_sandbox, check=True)
    msg_file.write_text("feat(infra): add logging chain\n")
    specs = repo_sandbox / "docs" / "superpowers" / "specs"
    specs.mkdir(parents=True)
    (specs / "centralized-logging.md").write_text("spec")
    subprocess.run(["git", "add", "docs/superpowers/specs/"], cwd=repo_sandbox, check=True)
    res = run_cmd(["bash", str(script), str(msg_file)], cwd=repo_sandbox)
    assert res.returncode != 0


def test_skip_commit_vs_diff_bypasses(repo_root: Path, run_cmd, repo_sandbox: Path, tmp_path: Path):
    hook = repo_root / ".githooks" / "commit-msg"
    msg_file = tmp_path / "msg-subject"
    msg_file.write_text("fix(infra): should be allowed with SKIP_COMMIT_VS_DIFF=1\n")

    src = repo_sandbox / "src"
    src.mkdir()
    (src / "middleware.test.ts").write_text("test")
    subprocess.run(["git", "add", "src/"], cwd=repo_sandbox, check=True)

    env = os.environ.copy()
    env["SKIP_COMMIT_VS_DIFF"] = "1"
    res = run_cmd(["bash", str(hook), str(msg_file)], cwd=repo_sandbox, env=env)
    assert res.returncode == 0


def test_self_test_passes(repo_root: Path, run_cmd):
    script = repo_root / "scripts" / "check-commit-vs-diff.sh"
    res = run_cmd(["bash", str(script), "--self-test"])
    assert res.returncode == 0
    assert "self-test passed" in res.stdout
