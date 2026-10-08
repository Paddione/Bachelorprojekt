"""Native migration of tests/spec/active-sessions-hub/agent-lock-release-cwd.bats."""

import pytest


@pytest.fixture
def lock_env(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated AGENT_LOCK_DIR, ambient session identity removed."""
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    monkeypatch.delenv("CLAUDE_CODE_SESSION_ID", raising=False)
    monkeypatch.delenv("AGENT_LOCK_SID", raising=False)
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    monkeypatch.setenv("CLAUDE_SESSION_ID", "claude-t006290-suite")
    return {"lock": str(repo_root / "scripts" / "agent-lock.sh"), "dir": lock_dir, "root": repo_root}


def _claim_branch(run_cmd, env, wt):
    run_cmd(["bash", env["lock"], "claim", "branch", "fix/agent-lock-cwd-probe",
             "--worktree", str(wt), "--label", "probe"]).check()
    lf = env["dir"] / "branch__fix-agent-lock-cwd-probe.json"
    assert lf.is_file()
    return lf


def test_t006290_release_branch_von_ausserhalb_des_worktrees_loest_den_lock_positiv_anker(run_cmd, lock_env, tmp_path):
    wt = tmp_path / "wt"
    wt.mkdir()
    lf = _claim_branch(run_cmd, lock_env, wt)

    r = run_cmd(["bash", lock_env["lock"], "release", "branch", "fix/agent-lock-cwd-probe"], cwd=lock_env["root"])
    assert r.returncode == 0
    assert not lf.exists(), "Lock trotz release von ausserhalb noch da"


def test_t006290_release_branch_mit_cwd_im_worktree_wird_verweigert_lock_bleibt(run_cmd, lock_env, tmp_path):
    wt = tmp_path / "wt"
    wt.mkdir()
    lf = _claim_branch(run_cmd, lock_env, wt)

    r = run_cmd(["bash", lock_env["lock"], "release", "branch", "fix/agent-lock-cwd-probe"], cwd=wt)
    assert r.returncode == 1
    assert "worktree" in r.output, f"Verweigerung nennt den Worktree-Kontext nicht: {r.output}"
    assert lf.is_file(), "Lock wurde trotz Verweigerung entfernt"


def test_t006290_release_branch_aus_worktree_subverzeichnis_wird_verweigert_containment(run_cmd, lock_env, tmp_path):
    wt = tmp_path / "wt"
    (wt / "scripts").mkdir(parents=True)
    lf = _claim_branch(run_cmd, lock_env, wt)

    r = run_cmd(["bash", lock_env["lock"], "release", "branch", "fix/agent-lock-cwd-probe"], cwd=wt / "scripts")
    assert r.returncode == 1
    assert lf.is_file(), "Lock trotz Verweigerung aus Subverzeichnis entfernt"


def test_t006290_release_branch_mit_force_aus_dem_worktree_loest_trotzdem_override(run_cmd, lock_env, tmp_path):
    wt = tmp_path / "wt"
    wt.mkdir()
    lf = _claim_branch(run_cmd, lock_env, wt)

    r = run_cmd(["bash", lock_env["lock"], "release", "branch", "fix/agent-lock-cwd-probe", "--force"], cwd=wt)
    assert r.returncode == 0
    assert not lf.exists(), "--force hat den Lock nicht entfernt"


def test_t006290_release_ticket_mit_cwd_im_worktree_bleibt_unveraendert_scope_grenze(run_cmd, lock_env, tmp_path):
    wt = tmp_path / "wt"
    wt.mkdir()
    run_cmd(["bash", lock_env["lock"], "claim", "ticket", "T006290", "--worktree", str(wt), "--label", "probe"]).check()
    lf = lock_env["dir"] / "ticket__T006290.json"
    assert lf.is_file()

    r = run_cmd(["bash", lock_env["lock"], "release", "ticket", "T006290"], cwd=wt)
    assert r.returncode == 0
    assert not lf.exists(), "ticket-Release wurde vom cwd-Guard geblockt"
