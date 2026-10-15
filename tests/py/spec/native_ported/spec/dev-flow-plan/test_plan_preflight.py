"""Native migration of tests/spec/dev-flow-plan/plan-preflight.bats."""
# Tests for scripts/plan-preflight.sh (fail-closed guard). Command output verification [T002448-M4].

# Each test builds a temp git fixture under tmp_path; AGENT_LOCK_DIR points outside the repo.

import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@test",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@test",
}


class Preflight:
    def __init__(self, run_cmd, script, test_dir, lock_dir):
        self.run_cmd = run_cmd
        self.script = script
        self.test_dir = test_dir
        self.lock_dir = lock_dir
        self.env = {"AGENT_LOCK_DIR": str(lock_dir)}

    def git(self, *args):
        return self.run_cmd(["git", *args], cwd=self.test_dir, env=GIT_ENV)

    def sh(self, *args):
        return self.run_cmd(["bash", str(self.script), *args], cwd=self.test_dir, env=self.env)

    def write_lock(self, name, content):
        (self.lock_dir / name).write_text(content + "\n", encoding="utf-8")


@pytest.fixture
def pf(run_cmd, repo_root, tmp_path):
    test_dir = tmp_path / "preflight-test"
    test_dir.mkdir()
    lock_dir = tmp_path / "agent-locks"
    lock_dir.mkdir()
    p = Preflight(run_cmd, repo_root / "scripts" / "plan-preflight.sh", test_dir, lock_dir)
    p.git("init", "-b", "main").check()
    (test_dir / "initial.txt").write_text("initial\n", encoding="utf-8")
    p.git("add", "initial.txt").check()
    p.git("commit", "-q", "-m", "initial commit").check()
    p.git("checkout", "-q", "-b", "feature/px")
    return p


LOCK = "branch__feature-px.json"


def test_usage_fehler_unbekanntes_subkommando_rc_2(pf):
    assert pf.sh("invalid-cmd").returncode == 2


def test_entferntes_ticket_flag_rc_2(pf):
    pf.write_lock(LOCK, '{"branch":"feature/px"}')
    res = pf.sh("pre-commit", "--ticket", "T009999")
    assert res.returncode == 2
    assert "entfernt" in res.output


def test_entferntes_pre_worktree_rc_2(pf):
    res = pf.sh("pre-worktree")
    assert res.returncode == 2
    assert "entfernt" in res.output


def test_pre_commit_auf_main_wird_abgelehnt_rc_1(pf):
    pf.git("checkout", "-q", "main")
    res = pf.sh("pre-commit")
    assert res.returncode == 1
    assert "main" in res.output

    # Positive anchor: feature branch + valid lock -> rc=0
    pf.git("checkout", "-q", "feature/px")
    pf.write_lock(LOCK, '{"branch":"feature/px"}')
    assert pf.sh("pre-commit").returncode == 0


def test_pre_commit_unstaged_dirty_tree_ist_ok_rc_0_gestagte_fremd_datei_wird_abgelehnt_rc_1(pf):
    pf.write_lock(LOCK, '{"branch":"feature/px"}')
    (pf.test_dir / "dirty.txt").write_text("dirty\n", encoding="utf-8")

    # Unstaged is irrelevant for the commit -> rc=0 (T005114: guard checks the staged set).
    assert pf.sh("pre-commit").returncode == 0

    # Positive anchor: staged foreign file outside the plan artifacts -> rc=1
    pf.git("add", "dirty.txt").check()
    res = pf.sh("pre-commit")
    assert res.returncode == 1
    assert "Fremd" in res.output

    # After commit -> rc=0
    pf.git("commit", "-q", "-m", "clean").check()
    assert pf.sh("pre-commit").returncode == 0


def test_pre_commit_ohne_branch_lock_wird_abgelehnt_rc_1(pf):
    res = pf.sh("pre-commit")
    assert res.returncode == 1
    assert LOCK in res.output
    assert "agent-lock.sh claim branch" in res.output


def test_pre_commit_ignoriert_ticket_scoped_lock_rc_1(pf):
    pf.write_lock("ticket__T009999.json", '{"branch":"feature/px"}')
    assert pf.sh("pre-commit").returncode == 1


def test_pre_commit_akzeptiert_branch_lock_rc_0_ohne_ticket_in_der_ausgabe(pf):
    pf.write_lock(LOCK, '{"branch":"feature/px"}')
    res = pf.sh("pre-commit")
    assert res.returncode == 0
    assert f"lock={LOCK}" in res.output
    assert "ticket=" not in res.output


def test_pre_commit_mit_branch_mismatch_im_lock_wird_abgelehnt_rc_1(pf):
    pf.write_lock(LOCK, '{"branch":"feature/andere"}')
    res = pf.sh("pre-commit")
    assert res.returncode == 1
    assert "Mismatch" in res.output

    # Positive anchor: corrected lock -> rc=0
    pf.write_lock(LOCK, '{"branch":"feature/px"}')
    assert pf.sh("pre-commit").returncode == 0
