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


STAGE_WRITE_PROBE = r"""
source "$1/scripts/vda/ticket/stage-plan.sh"
_pgpod() { echo "stub-pod"; }
_exec_sql() { if grep -q "IS NULL"; then echo "0"; else echo "1"; fi; }
_exec_sql_with_timeout() { echo "SQL-WRITE-BEGIN"; cat; echo "SQL-WRITE-END"; }
main --id T009999 --branch main --plan .agents/plans/demo/tasks.md --partials 1 --hold --allow-empty-touched
"""


def test_stage_plan_schreibt_body_nach_ticket_plans(run_cmd, repo_root, tmp_path):
    # T901719: stage-plan schreibt den Plan-Body als Staged-Row nach
    # tickets.ticket_plans (DB-SSOT). SQL-Ebene via Funktions-Stubs, keine DB.
    fixture = tmp_path / "stage-write"
    (fixture / ".agents" / "plans" / "demo").mkdir(parents=True)
    (fixture / ".agents" / "plans" / "demo" / "tasks.md").write_text(
        "# Demo\n\n## File Structure\n\nKein Pfad hier.\n", encoding="utf-8")
    run_cmd(["git", "init", "-b", "main", str(fixture)], env=GIT_ENV).check()
    run_cmd(["git", "-C", str(fixture), "add", "-A"], env=GIT_ENV).check()
    run_cmd(["git", "-C", str(fixture), "commit", "-q", "-m", "add plan"],
            env=GIT_ENV).check()
    probe = tmp_path / "stage-write-probe.sh"
    probe.write_text(STAGE_WRITE_PROBE, encoding="utf-8")
    res = run_cmd(["bash", str(probe), str(repo_root)], cwd=fixture)
    assert res.returncode == 0
    assert "INSERT INTO tickets.ticket_plans" in res.output
    assert "<!-- plan-stage branch=main" in res.output


def test_stage_plan_wiederholung_updatet_statt_duplikat(run_cmd, repo_root, tmp_path):
    # T901719: existiert die Staged-Row, schreibt stage-plan per UPDATE
    # (kein zweites INSERT).
    fixture = tmp_path / "stage-rewrite"
    (fixture / ".agents" / "plans" / "demo").mkdir(parents=True)
    (fixture / ".agents" / "plans" / "demo" / "tasks.md").write_text(
        "# Demo\n", encoding="utf-8")
    run_cmd(["git", "init", "-b", "main", str(fixture)], env=GIT_ENV).check()
    run_cmd(["git", "-C", str(fixture), "add", "-A"], env=GIT_ENV).check()
    run_cmd(["git", "-C", str(fixture), "commit", "-q", "-m", "add plan"],
            env=GIT_ENV).check()
    probe = tmp_path / "stage-rewrite-probe.sh"
    probe.write_text(
        STAGE_WRITE_PROBE.replace('echo "0"; else echo "1"',
                                  'echo "1"; else echo "1"'),
        encoding="utf-8")
    res = run_cmd(["bash", str(probe), str(repo_root)], cwd=fixture)
    assert res.returncode == 0
    assert "UPDATE tickets.ticket_plans" in res.output
    assert "INSERT INTO tickets.ticket_plans" not in res.output
