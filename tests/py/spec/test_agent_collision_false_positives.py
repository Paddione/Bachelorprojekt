"""Tests for agent collision detection false positive guards (migrated from tests/spec/agent-collision-false-positives.bats)."""

import json
import os
from pathlib import Path
import subprocess
import pytest


@pytest.fixture
def coll_env(tmp_path: Path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    return lock_dir, env


def test_m9_new_file_no_collision_alarm(repo_root: Path, coll_env):
    lock_dir, env = coll_env
    script = repo_root / "scripts" / "agent-collision.sh"

    lf = lock_dir / "ticket__T002469-m9.json"
    lf.write_text(
        json.dumps(
            {
                "scope": "ticket",
                "id": "T002469",
                "owner_sid": "other",
                "owner_pid": "999999",
                "tool": "claude",
                "label": "other",
                "worktree": "/tmp/nonexistent",
                "branch": "other",
                "host": "test",
                "created_at": "1",
                "heartbeat_at": "1",
            }
        )
    )

    env["AGENT_LOCK_FAKE_ALIVE"] = "other"
    res = subprocess.run(["bash", str(script), "check", "--branch", "--quiet"], env=env)
    assert res.returncode == 0


def test_m7_committed_peer_change_no_alarm(repo_root: Path, coll_env):
    _, env = coll_env
    script = repo_root / "scripts" / "agent-collision.sh"

    res = subprocess.run(["bash", str(script), "check", "--branch", "--quiet"], env=env)
    assert res.returncode == 0
