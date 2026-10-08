"""Native migration of tests/spec/repo-hygiene/windows-guards.bats."""

# (T900061)

import subprocess
from pathlib import Path

import pytest

PROBE_DIR = "zz-t900061-orphan-probe"


@pytest.fixture
def ctx(repo_root: Path, run_cmd, tmp_path):
    precheck = repo_root / "scripts" / "repo-hygiene-precheck.sh"
    health = repo_root / "scripts" / "git-worktree-health.sh"
    if not precheck.is_file():
        pytest.skip("repo-hygiene-precheck.sh fehlt")
    if not health.is_file():
        pytest.skip("git-worktree-health.sh fehlt")
    yield {"repo": repo_root, "precheck": precheck, "health": health, "run": run_cmd, "tmp": tmp_path}
    probe = repo_root / ".worktrees" / PROBE_DIR
    try:
        probe.rmdir()
    except OSError:
        pass


def _precheck_with_lock(c, lock: Path):
    return c["run"](["bash", str(c["precheck"])], env={"REPO_HYGIENE_TICK_LOCK": str(lock)})


def test_t900061_without_lock_file_precheck_reports_no_running_tick(ctx):
    lock = ctx["tmp"] / "gibt-es-nicht.lock"
    res = _precheck_with_lock(ctx, lock)
    assert "ok: kein laufender Hygiene-Tick" in res.output, res.output
    assert "Stabilitaets-Fingerabdruck:" in res.output


def test_t900061_free_lock_file_is_never_reported_as_running_tick(ctx):
    lock = ctx["tmp"] / "frei.lock"
    lock.write_text("", encoding="utf-8")
    res = _precheck_with_lock(ctx, lock)
    assert "BEFUND: Hygiene-Tick laeuft" not in res.output, res.output
    assert ("ok: kein laufender Hygiene-Tick" in res.output) or ("NICHT PRUEFBAR" in res.output), res.output


def test_t900061_precheck_does_not_write_to_lock_state(ctx):
    lock = ctx["tmp"] / "fremd.lock"
    lock.write_text("gehalten-von-4711\n", encoding="utf-8")
    before = lock.read_text(encoding="utf-8")
    _precheck_with_lock(ctx, lock)
    assert lock.read_text(encoding="utf-8") == before


def test_t900061_registered_worktrees_are_not_reported_as_orphans(ctx):
    porcelain = subprocess.run(
        ["git", "-C", str(ctx["repo"]), "worktree", "list", "--porcelain"],
        capture_output=True, text=True,
    ).stdout
    registered = sum(
        1 for line in porcelain.split("\n")
        if line.startswith("worktree ") and "/.worktrees/" in line
    )
    if registered == 0:
        pytest.skip("keine registrierten Worktrees unter .worktrees/")

    res = ctx["run"](["bash", str(ctx["health"]), "orphans"])
    assert res.returncode == 0, res.output
    assert "keine Orphan-Worktrees gefunden" in res.output


def test_t900061_unregistered_directory_is_reported_as_orphan(ctx):
    probe = ctx["repo"] / ".worktrees" / PROBE_DIR
    probe.mkdir(parents=True, exist_ok=True)
    res = ctx["run"](["bash", str(ctx["health"]), "orphans"])
    assert res.returncode == 1, res.output
    assert "ORPHAN-WORKTREE" in res.output
    assert PROBE_DIR in res.output
