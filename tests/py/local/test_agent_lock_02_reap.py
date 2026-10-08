"""Native migration of tests/local/AGENT-LOCK-02-reap.bats."""
import re

import pytest


@pytest.fixture
def lock_env(tmp_path, repo_root):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    env = {
        "AGENT_LOCK_DIR": str(lock_dir),
        "AGENT_LOCK_TTL": "1800",
        "AGENT_LOCK_GRACE": "0",
    }
    lock = repo_root / "scripts" / "agent-lock.sh"
    return {"dir": lock_dir, "env": env, "lock": str(lock)}


def _lock(ctx, run_cmd, sid, alive, *args):
    env = dict(ctx["env"], AGENT_LOCK_SID=str(sid), AGENT_LOCK_FAKE_ALIVE=alive)
    return run_cmd(["bash", ctx["lock"], *args], env=env)


def test_agent_lock_02a_reap_removes_a_dead_sid_lock(lock_env, run_cmd):
    """AGENT-LOCK-02a: reap removes a dead-sid lock"""
    _lock(lock_env, run_cmd, 100, "100", "claim", "ticket", "T1").check()
    # sid 100 now considered dead (not in FAKE_ALIVE during reap)
    result = _lock(lock_env, run_cmd, 999, "999", "reap")
    assert result.returncode == 0
    assert not (lock_env["dir"] / "ticket__T1.json").exists()


def test_agent_lock_02b_reap_removes_a_missing_worktree_lock(lock_env, run_cmd, tmp_path):
    """AGENT-LOCK-02b: reap removes a missing-worktree lock"""
    wt = tmp_path / "wt"
    wt.mkdir()
    _lock(lock_env, run_cmd, 100, "100", "claim", "branch", "b1", "--worktree", str(wt)).check()
    wt.rmdir()
    _lock(lock_env, run_cmd, 100, "999", "reap")
    assert not (lock_env["dir"] / "branch__b1.json").exists()


def test_agent_lock_02c_reap_keeps_a_live_lock(lock_env, run_cmd):
    """AGENT-LOCK-02c: reap keeps a live lock"""
    _lock(lock_env, run_cmd, 100, "100", "claim", "ticket", "T1").check()
    result = _lock(lock_env, run_cmd, 999, "100 999", "reap")
    assert result.returncode == 0
    assert (lock_env["dir"] / "ticket__T1.json").is_file()


def test_agent_lock_02d_claim_auto_reaps_a_dead_foreign_lock(lock_env, run_cmd):
    """AGENT-LOCK-02d: claim auto-reaps a dead foreign lock"""
    _lock(lock_env, run_cmd, 100, "100", "claim", "ticket", "T1").check()
    result = _lock(lock_env, run_cmd, 200, "200", "claim", "ticket", "T1")
    assert result.returncode == 0
    text = (lock_env["dir"] / "ticket__T1.json").read_text(encoding="utf-8")
    match = re.search(r'"owner_sid": *"([0-9]*)"', text)
    assert match is not None
    assert match.group(1) == "200"
