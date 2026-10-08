"""Native migration of tests/unit/scripts/stage-plan.bats."""
import subprocess  # noqa: F401  (kept for parity with git setup helpers)
from pathlib import Path

import pytest

GIT_IDENTITY = ["-c", "user.email=t@example.com", "-c", "user.name=Test"]


@pytest.fixture
def stage_plan(repo_root: Path) -> Path:
    return repo_root / "scripts" / "vda" / "ticket" / "stage-plan.sh"


def _git(run_cmd, repo: Path, *args):
    result = run_cmd(["git", *GIT_IDENTITY, *args], cwd=repo)
    assert result.returncode == 0, result.output
    return result


def _init_repo(run_cmd, repo: Path, *, with_plan_branch: bool):
    repo.mkdir(parents=True, exist_ok=True)
    _git(run_cmd, repo, "init", "-q", "-b", "main", ".")
    (repo / "README.md").write_text("base\n", encoding="utf-8")
    _git(run_cmd, repo, "add", "README.md")
    _git(run_cmd, repo, "commit", "-q", "-m", "base")
    if with_plan_branch:
        _git(run_cmd, repo, "checkout", "-q", "-b", "feature/only-here")
        (repo / ".agents" / "plans" / "demo").mkdir(parents=True)
        (repo / ".agents" / "plans" / "demo" / "tasks.md").write_text("# plan\n", encoding="utf-8")
        _git(run_cmd, repo, "add", ".agents/plans/demo/tasks.md")
        _git(run_cmd, repo, "commit", "-q", "-m", "plan")
        # Back to main: the plan is neither in the working tree nor in HEAD.
        _git(run_cmd, repo, "checkout", "-q", "main")


def test_stage_plan_rejects_factory_plan_ref_pointing_to_nonexistent_file(run_cmd, repo_root, stage_plan):
    result = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/test",
                      "--plan", ".agents/plans/nonexistent/tasks.md", "--no-hold"], cwd=repo_root, timeout=300)
    assert result.returncode == 1
    assert "does not exist" in result.output


def test_stage_plan_rejects_empty_plan_path(run_cmd, repo_root, stage_plan):
    result = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/test", "--plan", ""],
                     cwd=repo_root, timeout=300)
    assert result.returncode == 2
    assert "--plan is required" in result.output


def test_stage_plan_rejects_missing_id_flag(run_cmd, repo_root, stage_plan):
    result = run_cmd(["bash", str(stage_plan), "--branch", "feature/test",
                      "--plan", ".agents/plans/test/tasks.md"], cwd=repo_root, timeout=300)
    assert result.returncode == 2
    assert "--id is required" in result.output


def test_stage_plan_rejects_missing_branch_flag(run_cmd, repo_root, stage_plan):
    result = run_cmd(["bash", str(stage_plan), "--id", "T000999",
                      "--plan", ".agents/plans/test/tasks.md"], cwd=repo_root, timeout=300)
    assert result.returncode == 2
    assert "--branch is required" in result.output


def test_stage_plan_rejects_missing_plan_flag(run_cmd, repo_root, stage_plan):
    result = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/test"],
                     cwd=repo_root, timeout=300)
    assert result.returncode == 2
    assert "--plan is required" in result.output


def test_t002263_a_plan_that_exists_only_on_the_named_branch_is_accepted(run_cmd, repo_root, stage_plan, tmp_path):
    repo = tmp_path / "wt-repo"
    _init_repo(run_cmd, repo, with_plan_branch=True)
    # The DB step fails in this sandbox, which is fine. The pre-flight must not reject the plan.
    result = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/only-here",
                      "--plan", ".agents/plans/demo/tasks.md"], cwd=repo, timeout=300)
    assert "does not exist in git" not in result.output


def test_t002263_a_plan_on_no_branch_at_all_is_still_rejected(run_cmd, repo_root, stage_plan, tmp_path):
    repo = tmp_path / "wt-repo-empty"
    _init_repo(run_cmd, repo, with_plan_branch=False)
    result = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/absent",
                      "--plan", ".agents/plans/ghost/tasks.md", "--no-hold"], cwd=repo, timeout=300)
    assert result.returncode == 1
    assert "does not exist" in result.output


def test_t002263_archive_plan_accepts_a_plan_file_that_exists_only_on_the_named_branch(run_cmd, repo_root, tmp_path):
    repo = tmp_path / "wt-repo-archive"
    _init_repo(run_cmd, repo, with_plan_branch=True)
    # The DB step fails in this sandbox, which is fine. The pre-flight must not reject the file.
    result = run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "archive-plan", "--id", "T000999",
                      "--slug", "demo", "--branch", "feature/only-here",
                      "--plan-file", ".agents/plans/demo/tasks.md"], cwd=repo, timeout=300)
    assert "does not exist or is empty" not in result.output


def test_t002263_archive_plan_still_rejects_an_empty_plan_file_not_on_any_branch(run_cmd, repo_root, tmp_path):
    repo = tmp_path / "wt-repo-archive-empty"
    _init_repo(run_cmd, repo, with_plan_branch=False)
    result = run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "archive-plan", "--id", "T000999",
                      "--slug", "ghost", "--branch", "feature/absent",
                      "--plan-file", ".agents/plans/ghost/tasks.md"], cwd=repo, timeout=300)
    assert result.returncode == 1
    assert "does not exist or is empty" in result.output
