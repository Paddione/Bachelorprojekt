"""Tests for scripts/vda/ticket/stage-plan.sh (migrated from tests/unit/scripts/stage-plan.bats)."""

from pathlib import Path
import subprocess
import pytest


def test_stage_plan_flag_validations(repo_root: Path, run_cmd):
    stage_plan = repo_root / "scripts" / "vda" / "ticket" / "stage-plan.sh"

    # nonexistent plan
    res = run_cmd(
        ["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/test", "--plan", ".agents/plans/nonexistent/tasks.md", "--no-hold"]
    )
    assert res.returncode == 1
    assert "does not exist" in res.stdout or "does not exist" in res.stderr

    # empty plan
    res = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/test", "--plan", ""])
    assert res.returncode == 2
    assert "--plan is required" in res.stdout or "--plan is required" in res.stderr

    # missing --id
    res = run_cmd(["bash", str(stage_plan), "--branch", "feature/test", "--plan", ".agents/plans/test/tasks.md"])
    assert res.returncode == 2
    assert "--id is required" in res.stdout or "--id is required" in res.stderr

    # missing --branch
    res = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--plan", ".agents/plans/test/tasks.md"])
    assert res.returncode == 2
    assert "--branch is required" in res.stdout or "--branch is required" in res.stderr

    # missing --plan
    res = run_cmd(["bash", str(stage_plan), "--id", "T000999", "--branch", "feature/test"])
    assert res.returncode == 2
    assert "--plan is required" in res.stdout or "--plan is required" in res.stderr


def test_t002263_plan_on_named_branch_accepted(repo_root: Path, run_cmd, tmp_path: Path):
    stage_plan = repo_root / "scripts" / "vda" / "ticket" / "stage-plan.sh"
    repo = tmp_path / "wt-repo"
    repo.mkdir()

    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "t@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    (repo / "README.md").write_text("base")
    subprocess.run(["git", "-C", str(repo), "add", "README.md"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", "base"], check=True)

    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "-b", "feature/only-here"], check=True)
    plan_dir = repo / ".agents" / "plans" / "demo"
    plan_dir.mkdir(parents=True)
    (plan_dir / "tasks.md").write_text("# plan")
    subprocess.run(["git", "-C", str(repo), "add", ".agents/plans/demo/tasks.md"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", "plan"], check=True)

    # checkout main: plan not in working tree and not in HEAD
    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"], check=True)

    res = run_cmd(
        [
            "bash",
            str(stage_plan),
            "--id",
            "T000999",
            "--branch",
            "feature/only-here",
            "--plan",
            ".agents/plans/demo/tasks.md",
        ],
        cwd=repo,
    )
    out = res.stdout + res.stderr
    assert "does not exist in git" not in out


def test_t002263_archive_plan_named_branch(repo_root: Path, run_cmd, tmp_path: Path):
    ticket_sh = repo_root / "scripts" / "ticket.sh"
    repo = tmp_path / "wt-repo-archive"
    repo.mkdir()

    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "t@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    (repo / "README.md").write_text("base")
    subprocess.run(["git", "-C", str(repo), "add", "README.md"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", "base"], check=True)

    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "-b", "feature/only-here"], check=True)
    plan_dir = repo / ".agents" / "plans" / "demo"
    plan_dir.mkdir(parents=True)
    (plan_dir / "tasks.md").write_text("# plan")
    subprocess.run(["git", "-C", str(repo), "add", ".agents/plans/demo/tasks.md"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", "plan"], check=True)
    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"], check=True)

    res = run_cmd(
        [
            "bash",
            str(ticket_sh),
            "archive-plan",
            "--id",
            "T000999",
            "--slug",
            "demo",
            "--branch",
            "feature/only-here",
            "--plan-file",
            ".agents/plans/demo/tasks.md",
        ],
        cwd=repo,
    )
    out = res.stdout + res.stderr
    assert "does not exist or is empty" not in out
