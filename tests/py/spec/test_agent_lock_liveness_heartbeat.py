"""Tests for agent-lock liveness and heartbeat (migrated from tests/spec/agent-lock-liveness-heartbeat.bats)."""

import json
import os
from pathlib import Path
import subprocess
import time
import pytest


@pytest.fixture
def liveness_env(tmp_path: Path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    wt = tmp_path / "fake-worktree"
    wt.mkdir()

    subprocess.run(["git", "-C", str(wt), "init", "-q"], check=True)
    subprocess.run(["git", "-C", str(wt), "config", "user.email", "t@example.com"], check=True)
    subprocess.run(["git", "-C", str(wt), "config", "user.name", "test"], check=True)
    subprocess.run(["git", "-C", str(wt), "commit", "-q", "--allow-empty", "-m", "init"], check=True)
    subprocess.run(["git", "-C", str(wt), "checkout", "-q", "-b", "fix/demo-T015822"], check=True)

    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env["AGENT_LOCK_SID"] = "t015822-test"
    env["AGENT_LOCK_GRACE"] = "5"
    env.pop("AGENT_LOCK_FAKE_ALIVE", None)

    return lock_dir, wt, env


def _mk_lock(lock_dir: Path, wt: Path, scope: str, lock_id: str, pid: str, age: int, sid: str):
    ts = int(time.time()) - age
    worktree = "" if scope == "main-checkout" else str(wt)
    branch = "" if scope == "main-checkout" else "fix/demo-T015822"
    lock_file = lock_dir / f"{scope}__{lock_id}.json"
    lock_file.write_text(
        json.dumps(
            {
                "scope": scope,
                "id": lock_id,
                "owner_sid": sid,
                "owner_pid": str(pid),
                "tool": "claude",
                "label": "liveness-T015822",
                "worktree": worktree,
                "branch": branch,
                "ticket": "",
                "host": "testhost",
                "created_at": str(ts),
                "heartbeat_at": str(ts),
            }
        )
    )
    return lock_file


def test_t1_live_process_in_worktree_keeps_lock(repo_root: Path, liveness_env):
    lock_dir, wt, env = liveness_env
    script = repo_root / "scripts" / "agent-lock.sh"

    _mk_lock(lock_dir, wt, "ticket", "T015822-t1", "4194303", 30, "999999")
    proc = subprocess.Popen(["sleep", "30"], cwd=wt)
    time.sleep(1)

    try:
        res = subprocess.run(["bash", str(script), "check", "ticket", "T015822-t1"], env=env, capture_output=True, text=True)
        assert res.stdout.strip() != "free"
    finally:
        proc.terminate()
        proc.wait()


def test_t2_dead_pid_without_live_process_reaped(repo_root: Path, liveness_env):
    lock_dir, wt, env = liveness_env
    script = repo_root / "scripts" / "agent-lock.sh"

    _mk_lock(lock_dir, wt, "ticket", "T0015822-t2", "4194303", 30, "999999")
    res = subprocess.run(["bash", str(script), "check", "ticket", "T0015822-t2"], env=env, capture_output=True, text=True)
    assert res.stdout.strip() == "free"


def test_t3_guard_precommit_refreshes_heartbeat(repo_root: Path, liveness_env):
    lock_dir, wt, env = liveness_env
    script = repo_root / "scripts" / "agent-lock.sh"

    lf = _mk_lock(lock_dir, wt, "branch", "heartbeat", str(os.getpid()), 600, "t015822-test")
    data_before = json.loads(lf.read_text())
    hb_before = data_before["heartbeat_at"]

    res = subprocess.run(["bash", str(script), "guard-precommit"], cwd=wt, env=env, capture_output=True)
    assert res.returncode == 0

    data_after = json.loads(lf.read_text())
    hb_after = data_after["heartbeat_at"]
    assert hb_after != hb_before


def test_t4_guard_precommit_fails_open_missing_store(repo_root: Path, tmp_path: Path):
    script = repo_root / "scripts" / "agent-lock.sh"
    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(tmp_path / "missing-store" / ".nosuch")
    res = subprocess.run(["bash", str(script), "guard-precommit"], env=env, capture_output=True)
    assert res.returncode == 0
