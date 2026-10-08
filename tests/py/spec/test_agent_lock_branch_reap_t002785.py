"""Tests for agent-lock branch reaping (migrated from tests/spec/agent-lock-branch-reap-T002785.bats)."""

import json
import os
from pathlib import Path
import subprocess
import time
import pytest


@pytest.fixture
def reap_env(tmp_path: Path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env.pop("CLAUDE_CODE_SESSION_ID", None)
    env["CLAUDE_SESSION_ID"] = "claude-t002785-suite"
    env.pop("AGENT_LOCK_SID", None)
    return lock_dir, env


def _age_lock(lock_file: Path):
    data = json.loads(lock_file.read_text())
    old = int(time.time()) - 3600
    data["created_at"] = old
    data["heartbeat_at"] = old
    lock_file.write_text(json.dumps(data))


def test_t002785_dead_branch_lock_reaped_fast(repo_root: Path, reap_env):
    lock_dir, env = reap_env
    script = repo_root / "scripts" / "agent-lock.sh"

    subprocess.run(
        [
            "bash",
            str(script),
            "claim",
            "branch",
            "fix/t002785-reap-probe",
            "--worktree",
            "/tmp/definitely-missing-t002785",
            "--label",
            "probe",
        ],
        env=env,
        check=True,
    )
    lf = lock_dir / "branch__fix-t002785-reap-probe.json"
    assert lf.is_file()
    _age_lock(lf)

    res = subprocess.run(["bash", str(script), "reap"], env=env, capture_output=True)
    assert res.returncode == 0
    assert not lf.exists()

    reap_log = lock_dir / ".reap.log"
    assert "branch/fix/t002785-reap-probe worktree-missing" in reap_log.read_text()


def test_t002785_fresh_branch_lock_spared(repo_root: Path, reap_env):
    lock_dir, env = reap_env
    script = repo_root / "scripts" / "agent-lock.sh"

    subprocess.run(
        [
            "bash",
            str(script),
            "claim",
            "branch",
            "fix/t002785-reap-fresh",
            "--worktree",
            "/tmp/definitely-missing-t002785",
            "--label",
            "probe",
        ],
        env=env,
        check=True,
    )
    lf = lock_dir / "branch__fix-t002785-reap-fresh.json"
    assert lf.is_file()

    res = subprocess.run(["bash", str(script), "reap"], env=env)
    assert res.returncode == 0
    assert lf.is_file()


def test_t002785_lock_with_living_worktree_kept(repo_root: Path, reap_env, tmp_path: Path):
    lock_dir, env = reap_env
    script = repo_root / "scripts" / "agent-lock.sh"
    wt = tmp_path / "living-wt"
    wt.mkdir()

    subprocess.run(
        ["bash", str(script), "claim", "branch", "fix/t002785-reap-wt", "--worktree", str(wt), "--label", "probe"],
        env=env,
        check=True,
    )
    lf = lock_dir / "branch__fix-t002785-reap-wt.json"
    _age_lock(lf)

    res = subprocess.run(["bash", str(script), "reap"], env=env)
    assert res.returncode == 0
    assert lf.is_file()
