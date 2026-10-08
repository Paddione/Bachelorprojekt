"""Tests for agent-lock force claim (migrated from tests/spec/agent-lock-force-claim.bats)."""

import json
import os
from pathlib import Path
import subprocess
import pytest


@pytest.fixture
def force_lock_env(tmp_path: Path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env.pop("CLAUDE_CODE_SESSION_ID", None)
    env["CLAUDE_SESSION_ID"] = "claude-t002454-suite"
    env.pop("AGENT_LOCK_SID", None)
    return lock_dir, env


def test_claim_force_takes_over_dead_pid(repo_root: Path, force_lock_env):
    lock_dir, env = force_lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    env_dead = env.copy()
    env_dead["AGENT_LOCK_SID"] = "dead-session"
    subprocess.run(["bash", str(script), "claim", "ticket", "T002454-f1", "--label", "old-session"], env=env_dead, check=True)

    lock_file = lock_dir / "ticket__T002454-f1.json"
    data = json.loads(lock_file.read_text())
    data["owner_pid"] = "999999"
    lock_file.write_text(json.dumps(data))

    env_new = env.copy()
    env_new["AGENT_LOCK_SID"] = "new-session"
    res = subprocess.run(["bash", str(script), "claim", "ticket", "T002454-f1", "--force", "--label", "new-session"], env=env_new)
    assert res.returncode == 0


def test_claim_force_refuses_when_owner_pid_alive(repo_root: Path, force_lock_env):
    lock_dir, env = force_lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    env_alive = env.copy()
    env_alive["AGENT_LOCK_SID"] = "alive-session"
    subprocess.run(["bash", str(script), "claim", "ticket", "T002454-f2", "--label", "old-session"], env=env_alive, check=True)

    lock_file = lock_dir / "ticket__T002454-f2.json"
    data = json.loads(lock_file.read_text())
    data["owner_pid"] = str(os.getpid())
    lock_file.write_text(json.dumps(data))

    env_new = env.copy()
    env_new["AGENT_LOCK_SID"] = "new-session"
    res = subprocess.run(
        ["bash", str(script), "claim", "ticket", "T002454-f2", "--force", "--label", "new-session"],
        env=env_new,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 1
    assert "claim --force abgelehnt" in res.stdout or "claim --force abgelehnt" in res.stderr


def test_reap_log_contains_claim_force(repo_root: Path, force_lock_env):
    lock_dir, env = force_lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    env_dead = env.copy()
    env_dead["AGENT_LOCK_SID"] = "dead-session"
    subprocess.run(["bash", str(script), "claim", "ticket", "T002454-f3", "--label", "old"], env=env_dead, check=True)

    lock_file = lock_dir / "ticket__T002454-f3.json"
    data = json.loads(lock_file.read_text())
    data["owner_pid"] = "999999"
    lock_file.write_text(json.dumps(data))

    env_new = env.copy()
    env_new["AGENT_LOCK_SID"] = "new-session"
    subprocess.run(["bash", str(script), "claim", "ticket", "T002454-f3", "--force", "--label", "new"], env=env_new, check=True)

    reap_log = lock_dir / ".reap.log"
    assert "claim-force" in reap_log.read_text()


def test_claim_without_force_rejected_for_other_session(repo_root: Path, force_lock_env):
    lock_dir, env = force_lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    env_a = env.copy()
    env_a["AGENT_LOCK_SID"] = "session-A"
    subprocess.run(["bash", str(script), "claim", "ticket", "T002454-f4", "--label", "first"], env=env_a, check=True)

    env_b = env.copy()
    env_b["AGENT_LOCK_SID"] = "session-B"
    res = subprocess.run(["bash", str(script), "claim", "ticket", "T002454-f4", "--label", "second"], env=env_b, capture_output=True, text=True)
    assert res.returncode == 1
    assert "bereits gehalten" in res.stdout or "bereits gehalten" in res.stderr
