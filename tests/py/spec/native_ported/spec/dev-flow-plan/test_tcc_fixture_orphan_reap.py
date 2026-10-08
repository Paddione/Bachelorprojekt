"""Native migration of tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats."""
# T002710: an orphaned tcc-fixture-<pid> directory from an aborted run must be reaped by the next
# setup() run, while look-alike directories stay untouched.
# The BATS original ran the sibling suite via the bats binary to trigger its setup(). That binary
# may not be called from this port, so the trigger is a single pytest case of the native
# task-context module, run as a subprocess (same role: trigger the reaper, then check the

# filesystem state). Command output verification [T002448-M4].

import shutil
import subprocess
import sys
import time

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")

TRIGGER = (
    "tests/py/spec/native_ported/spec/dev-flow-plan/test_task_context.py"
    "::test_tcc_asm_partial_p3_liefert_genau_dessen_impact_files"
)


@pytest.fixture
def paths(repo_root):
    plans = repo_root / ".agents" / "plans"
    p = {
        "stale": plans / "tcc-fixture-999999999",
        "anchor": plans / "_t002710-anchor-fixture",
        "plan_like": plans / "tcc-fixture-cleanup",
    }
    yield p
    for path in p.values():
        shutil.rmtree(path, ignore_errors=True)


def test_tcc_reap_verwaistes_tcc_fixture_verzeichnis_wird_beim_naechsten_setup_entfernt(repo_root, paths):
    stale, anchor, plan_like = paths["stale"], paths["anchor"], paths["plan_like"]
    shutil.rmtree(stale, ignore_errors=True)
    stale.mkdir(parents=True)
    (stale / "leftover.txt").write_text("leftover\n", encoding="utf-8")
    # mtime 20 minutes in the past, above the reap threshold.
    old = time.time() - 20 * 60
    import os
    os.utime(stale, (old, old))

    # Positive anchor: a directory outside the tcc-fixture-*<digits> pattern stays untouched.
    shutil.rmtree(anchor, ignore_errors=True)
    anchor.mkdir(parents=True)
    (anchor / "marker.txt").write_text("keep me\n", encoding="utf-8")

    # Second positive anchor: tcc-fixture-* WITHOUT a digit suffix (the plan slug pattern).
    shutil.rmtree(plan_like, ignore_errors=True)
    plan_like.mkdir(parents=True)
    (plan_like / "marker.txt").write_text("keep me\n", encoding="utf-8")

    res = subprocess.run(
        [sys.executable, "-m", "pytest", "-c", "tests/py/pytest.ini", "-p", "no:cacheprovider", "-q", TRIGGER],
        cwd=str(repo_root), capture_output=True, text=True, timeout=600,
    )
    assert res.returncode == 0, f"Trigger-Test fehlgeschlagen: {res.stdout}\n{res.stderr}"

    assert not stale.exists(), f"verwaistes tcc-fixture-Verzeichnis wurde NICHT entfernt: {stale}"
    assert (anchor / "marker.txt").is_file(), f"Positiv-Anker wurde faelschlich entfernt: {anchor}"
    assert (plan_like / "marker.txt").is_file(), f"Plan-Slug-aehnliches Verzeichnis wurde entfernt: {plan_like}"
