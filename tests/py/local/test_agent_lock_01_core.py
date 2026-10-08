"""Native migration of tests/local/AGENT-LOCK-01-core.bats."""
import re
import time

import pytest


@pytest.fixture
def lock_env(tmp_path, repo_root):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    script = repo_root / "scripts" / "agent-lock.sh"
    if not script.exists():
        pytest.skip(f"missing {script}")

    def env(sid, alive=None):
        result = {
            "AGENT_LOCK_DIR": str(lock_dir),
            "AGENT_LOCK_TTL": "1800",
            "AGENT_LOCK_SID": str(sid),
        }
        if alive is not None:
            result["AGENT_LOCK_FAKE_ALIVE"] = alive
        return result

    return {"dir": lock_dir, "script": str(script), "env": env}


def _lock_file(lock):
    return lock["dir"] / "ticket__T1.json"


def _heartbeat(path):
    match = re.search(r'"heartbeat_at": *"([0-9]*)"', path.read_text())
    return int(match.group(1))


def test_agent_lock_01a_claim_succeeds_when_free(run_cmd, lock_env):
    """AGENT-LOCK-01a: claim succeeds when free"""
    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1", "--label", "test"],
        env=lock_env["env"](100, "100"),
    )
    assert r.returncode == 0, r.output
    assert _lock_file(lock_env).is_file()


def test_agent_lock_01b_foreign_live_claim_is_blocked(run_cmd, lock_env):
    """AGENT-LOCK-01b: foreign live claim is blocked"""
    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1"],
        env=lock_env["env"](100, "100 200"),
    )
    r.check(0)
    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1"],
        env=lock_env["env"](200, "100 200"),
    )
    assert r.returncode == 1, r.output
    assert "bereits gehalten" in r.output


def test_agent_lock_01c_same_sid_reclaim_is_idempotent(run_cmd, lock_env):
    """AGENT-LOCK-01c: same-sid re-claim is idempotent"""
    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1"],
        env=lock_env["env"](100, "100"),
    )
    r.check(0)
    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1"],
        env=lock_env["env"](100, "100"),
    )
    assert r.returncode == 0, r.output


def test_agent_lock_01d_check_exit_codes_free_mine_held(run_cmd, lock_env):
    """AGENT-LOCK-01d: check exit codes free/mine/held"""
    alive = "100 200"
    r = run_cmd(
        ["bash", lock_env["script"], "check", "ticket", "T1"],
        env=lock_env["env"](100, alive),
    )
    assert r.returncode == 0, r.output
    assert r.output == "free"

    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1"],
        env=lock_env["env"](100, alive),
    )
    r.check(0)

    r = run_cmd(
        ["bash", lock_env["script"], "check", "ticket", "T1"],
        env=lock_env["env"](100, alive),
    )
    assert r.returncode == 0, r.output
    assert r.output.splitlines()[0] == "mine"

    r = run_cmd(
        ["bash", lock_env["script"], "check", "ticket", "T1"],
        env=lock_env["env"](200, alive),
    )
    assert r.returncode == 3, r.output
    assert r.output.splitlines()[0] == "held"


def test_agent_lock_01e_refresh_bumps_heartbeat_for_owner(run_cmd, lock_env):
    """AGENT-LOCK-01e: refresh bumps heartbeat for owner"""
    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1"],
        env=lock_env["env"](100, "100"),
    )
    r.check(0)
    hb1 = _heartbeat(_lock_file(lock_env))
    time.sleep(1)
    r = run_cmd(
        ["bash", lock_env["script"], "refresh", "ticket", "T1"],
        env=lock_env["env"](100, "100"),
    )
    assert r.returncode == 0, r.output
    hb2 = _heartbeat(_lock_file(lock_env))
    assert hb2 >= hb1


def test_agent_lock_01f_release_frees_the_lock(run_cmd, lock_env):
    """AGENT-LOCK-01f: release frees the lock"""
    r = run_cmd(
        ["bash", lock_env["script"], "claim", "ticket", "T1"],
        env=lock_env["env"](100, "100"),
    )
    r.check(0)
    r = run_cmd(
        ["bash", lock_env["script"], "release", "ticket", "T1"],
        env=lock_env["env"](100, "100"),
    )
    assert r.returncode == 0, r.output
    assert not _lock_file(lock_env).exists()


def test_agent_lock_01g_mine_prints_the_session_id(run_cmd, lock_env):
    """AGENT-LOCK-01g: mine prints the session id"""
    r = run_cmd(
        ["bash", lock_env["script"], "mine"],
        env=lock_env["env"](777),
    )
    assert r.returncode == 0, r.output
    assert r.output == "777"
