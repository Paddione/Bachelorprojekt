"""Native migration of tests/spec/agent-lock-reclaim/pid-dead-worktree-match-T002849.bats."""

import json
import os
import subprocess
import time
from pathlib import Path

import pytest

BRANCH = "fix/demo-T002849"


@pytest.fixture
def lock_env(repo_root, tmp_path, monkeypatch):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    wt = tmp_path / "fake-worktree"
    wt.mkdir()
    git = ["git", "-C", str(wt)]
    subprocess.run(git + ["init", "-q"], check=True)
    subprocess.run(git + ["config", "user.email", "t@example.com"], check=True)
    subprocess.run(git + ["config", "user.name", "test"], check=True)
    subprocess.run(git + ["commit", "-q", "--allow-empty", "-m", "init"], check=True)
    subprocess.run(git + ["checkout", "-q", "-b", BRANCH], check=True)
    env = {
        "AGENT_LOCK_DIR": str(lock_dir),
        "AGENT_LOCK_FAKE_ALIVE": "",
        "AGENT_LOCK_GRACE": "5",
    }
    return {"lock_dir": lock_dir, "wt": wt, "env": env, "repo_root": repo_root}


def _mk_lock(env_ctx, lock_id, pid, age):
    ts = str(int(time.time()) - age)
    data = {
        "scope": "ticket",
        "id": lock_id,
        "owner_sid": "999999",
        "owner_pid": str(pid),
        "tool": "claude",
        "label": "crashed-session",
        "worktree": str(env_ctx["wt"]),
        "branch": BRANCH,
        "ticket": "",
        "host": "testhost",
        "created_at": ts,
        "heartbeat_at": ts,
    }
    (env_ctx["lock_dir"] / f"ticket__{lock_id}.json").write_text(json.dumps(data, indent=2) + "\n")


def _check(env_ctx, run_cmd, lock_id):
    script = env_ctx["repo_root"] / "scripts" / "agent-lock.sh"
    return run_cmd(["bash", str(script), "check", "ticket", lock_id], env=env_ctx["env"])


def test_t002849_worktree_branch_matched_claim_with_dead_pid_reaps_after_grace_period(lock_env, run_cmd):
    # PID 4194303 is above the usual pid_max; age 30s > grace 5s, well under TTL.
    _mk_lock(lock_env, "T002849DEAD", 4194303, 30)
    res = _check(lock_env, run_cmd, "T002849DEAD")
    assert res.returncode == 0
    assert res.output == "free"


def test_t002849_fresh_worktree_branch_matched_claim_with_dead_pid_stays_held_resume_window(lock_env, run_cmd):
    _mk_lock(lock_env, "T002849FRESH", 4194303, 1)
    res = _check(lock_env, run_cmd, "T002849FRESH")
    assert res.returncode == 3
    assert "held" in res.output


def test_t002849_worktree_branch_matched_claim_with_a_live_pid_stays_held_past_grace(lock_env, run_cmd):
    # The pytest process is alive for the duration of the test.
    _mk_lock(lock_env, "T002849LIVE", os.getpid(), 30)
    res = _check(lock_env, run_cmd, "T002849LIVE")
    assert res.returncode == 3
    assert "held" in res.output
