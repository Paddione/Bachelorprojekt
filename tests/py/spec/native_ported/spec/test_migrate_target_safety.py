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

T901788 follow-up: go-task merges same-named global `vars` from flattened
includes plus the CLI variable into one pool and picks the winner in Go map
order — the CLI variable loses randomly (~1/3 of runs rendered
ENV=mentolder for a bogus CLI value on task 3.52.0). The determinism test
below is output verification; the duplicate guard is a static invariant in
the style of the flux-render-security literal-coupling tests (it protects
exactly this module's determinism).
"""

import re
import shutil

import pytest


def _dry_run(run_cmd, repo_root, env):
    return run_cmd(
        ["task", "-d", str(repo_root), "-n", "website:migrate", f"ENV={env}"],
        env={"ENV": env},
    )


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


def test_cli_env_is_deterministic_across_runs(run_cmd, repo_root):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    # Positive anchor: a known env still renders (guards vacuity, T002356-M1).
    ok = _dry_run(run_cmd, repo_root, "dev")
    assert ok.returncode == 0
    # The fix: the CLI variable must win on EVERY run. With 4 competing
    # global ENV definitions the winner is drawn per process (~1/3 wrong),
    # so 10 consecutive rejections prove determinism.
    # RED (T901788): some runs render rc 0 with ENV=mentolder — expected: FAIL.
    bogus = "bogus-no-such-env-t901788"
    for i in range(10):
        bad = _dry_run(run_cmd, repo_root, bogus)
        assert bad.returncode != 0, (
            f"run {i}: CLI ENV ignored (rc 0), rendered:\n{bad.output[:600]}"
        )


def test_no_duplicate_top_level_taskfile_vars(repo_root):
    # Static invariant: a top-level var name defined in 2+ Taskfiles joins
    # the nondeterministic pool (flatten only namespaces tasks, not globals).
    # Each name must exist at most once across the root file and all includes.
    # RED (T901788): ENV x4, NS_DEV x2, CTX_DEV x2, CLUSTER_NAME x2 — expected: FAIL.
    files = [repo_root / "Taskfile.yml", *sorted((repo_root / "taskfiles").glob("Taskfile.*.yml"))]
    assert len(files) > 5, f"unexpected Taskfile set: {files}"
    seen: dict = {}
    dupes = []
    for path in files:
        in_vars = False
        for line in path.read_text(encoding="utf-8").splitlines():
            if re.match(r"^vars:\s*(#.*)?$", line):
                in_vars = True
                continue
            if re.match(r"^[A-Za-z_][A-Za-z0-9_-]*:", line):
                in_vars = False
                continue
            match = re.match(r"^  ([A-Za-z_][A-Za-z0-9_]*):", line)
            if in_vars and match:
                name = match.group(1)
                if name in seen:
                    dupes.append(f"{name}: {seen[name].name} + {path.name}")
                else:
                    seen[name] = path
    assert not dupes, "duplicate top-level taskfile vars:\n" + "\n".join(dupes)
