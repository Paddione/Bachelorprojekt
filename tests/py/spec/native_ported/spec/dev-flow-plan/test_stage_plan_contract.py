"""Native migration of tests/spec/dev-flow-plan/stage-plan-contract.bats."""
# Contract tests for stage-plan: only parsing/flag errors that happen BEFORE any DB access.

# CI has no ticket DB. Command output verification [T002448-M4].

import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@test",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@test",
}


@pytest.fixture
def stage(run_cmd, repo_root, tmp_path):
    test_dir = tmp_path / "stage-test"
    test_dir.mkdir()
    run_cmd(["git", "init", "-b", "main", str(test_dir)], env=GIT_ENV).check()
    (test_dir / "test-plan.md").write_text("# Test plan\n", encoding="utf-8")
    run_cmd(["git", "-C", str(test_dir), "add", "test-plan.md"], env=GIT_ENV).check()
    run_cmd(["git", "-C", str(test_dir), "commit", "-q", "-m", "add plan"], env=GIT_ENV).check()
    stage_cmd = f"{repo_root}/scripts/ticket.sh stage-plan"

    def _run(args: str):
        # Same as: run bash -c "cd '$REPO_ROOT' && $STAGE <args>"
        return run_cmd(["bash", "-c", f"cd '{repo_root}' && {stage_cmd} {args}"], cwd=test_dir)

    return _run


def test_ohne_hold_no_hold_rc_1_meldung_nennt_beide_flags(stage):
    res = stage("--id T009999 --branch main --plan test-plan.md --partials 1")
    assert res.returncode == 1
    assert "--hold" in res.output
    assert "--no-hold" in res.output


def test_partials_0_rc_2(stage):
    res = stage("--id T009999 --branch main --plan test-plan.md --partials 0 --no-hold")
    assert res.returncode == 2


def test_unbekanntes_flag_rc_2_usage_nennt_no_hold_und_allow_empty_touched(stage):
    res = stage("--id T009999 --branch main --plan test-plan.md --partials 1 --xyz")
    assert res.returncode == 2
    assert "--no-hold" in res.output
    assert "--allow-empty-touched" in res.output


def test_plan_nicht_committed_rc_1_vor_der_db(stage):
    res = stage("--id T009999 --branch main --plan nonexistent.md --partials 1 --no-hold")
    assert res.returncode == 1
