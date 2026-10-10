"""Default pytest worker count (scripts/pytest-default-jobs.sh)."""

import os


def _jobs(repo_root, run_cmd, nproc):
    result = run_cmd(
        ["bash", "scripts/pytest-default-jobs.sh"],
        cwd=repo_root,
        env={"PYTEST_DEFAULT_JOBS_NPROC": str(nproc)},
    )
    assert result.returncode == 0, result.output
    return int(result.output.strip())


def test_default_jobs_matches_runner_sh_formula(repo_root, run_cmd):
    assert _jobs(repo_root, run_cmd, 12) == 4
    assert _jobs(repo_root, run_cmd, 4) == 2
    assert _jobs(repo_root, run_cmd, 2) == 1


def test_default_jobs_clamps_to_one_and_four(repo_root, run_cmd):
    assert _jobs(repo_root, run_cmd, 1) == 1
    assert _jobs(repo_root, run_cmd, 64) == 4


def test_default_jobs_uses_host_cpu_count_without_override(repo_root, run_cmd):
    result = run_cmd(["bash", "scripts/pytest-default-jobs.sh"], cwd=repo_root)
    assert result.returncode == 0, result.output
    expected = min(max((os.cpu_count() or 2) // 2, 1), 4)
    assert int(result.output.strip()) == expected
