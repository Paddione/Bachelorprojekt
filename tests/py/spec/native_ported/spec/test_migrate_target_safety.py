"""Migrate target safety for task website:migrate (T901750).

Output verification (T002448-M4): asserts on `task --dry` exit codes and the
rendered command text, never on Taskfile source. The rendered dry-run text is
the command the operator would execute, so a fixed port mapping in it is a
semantic defect (it decides which local port gets bound), not Darstellung.

Bug context: the task backgrounded `kubectl port-forward svc/shared-db
5432:5432` and waited a fixed `sleep 3` without any liveness/ready check. When
localhost:5432 was already occupied by a foreign forward, the migration ran
silently against the squatting server (observed: staging run connected to
PROD and failed only on SCRAM auth). Unknown ENV values were never rejected
at task level (no preconditions).
"""

import shutil

import pytest


def _dry_run(run_cmd, repo_root, env):
    return run_cmd(["task", "-d", str(repo_root), "-n", "website:migrate", f"ENV={env}"])


def test_unknown_env_is_rejected_at_task_level(run_cmd, repo_root):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    # Positive anchor: a known env still renders (guards vacuity, T002356-M1).
    ok = _dry_run(run_cmd, repo_root, "dev")
    assert ok.returncode == 0
    # The fix: unknown env must fail closed via task preconditions.
    # RED (T901750): renders with rc 0 today — expected: FAIL.
    bad = _dry_run(run_cmd, repo_root, "bogus-no-such-env-t901750")
    assert bad.returncode != 0


def test_no_fixed_well_known_local_port(run_cmd, repo_root):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    # Positive anchors: staging renders and still forwards + migrates.
    rendered = _dry_run(run_cmd, repo_root, "staging")
    assert rendered.returncode == 0
    assert "port-forward" in rendered.output
    assert "db:migrate" in rendered.output
    # The fix: no fixed 5432:5432 mapping — the local port must be ephemeral
    # so a squatter on 5432 can never hijack the migration target.
    # RED (T901750): fixed mapping present today — expected: FAIL.
    assert "5432:5432" not in rendered.output
