"""Tests for LSP daemon ignore in agent-lock reaping (migrated from tests/spec/agent-lock-lsp-reap-T900306.bats)."""

import json
import os
from pathlib import Path
import subprocess
import time
import pytest


@pytest.fixture
def lsp_env(tmp_path: Path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    wt = tmp_path / "fake-wt"
    wt.mkdir()

    subprocess.run(["git", "-C", str(wt), "init", "-q"], check=True)
    subprocess.run(["git", "-C", str(wt), "config", "user.email", "t@example.com"], check=True)
    subprocess.run(["git", "-C", str(wt), "config", "user.name", "test"], check=True)
    subprocess.run(["git", "-C", str(wt), "commit", "-q", "--allow-empty", "-m", "init"], check=True)
    subprocess.run(["git", "-C", str(wt), "checkout", "-q", "-b", "fix/demo-lsp-reap"], check=True)

    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env["AGENT_LOCK_SID"] = "t900306-test"
    env["AGENT_LOCK_GRACE"] = "2"

    return lock_dir, wt, env


def test_t900306_worktree_has_active_process_ignores_lsp(repo_root: Path, lsp_env):
    lock_dir, wt, env = lsp_env
    activity_lib = repo_root / "scripts" / "agent-lock-activity.sh"

    # Spawn simulated language server
    proc = subprocess.Popen(["bash", "-c", "exec -a typescript-language-server sleep 30"], cwd=wt)
    time.sleep(0.3)

    try:
        check_cmd = f"source '{activity_lib}' && _worktree_has_active_process '{wt}'"
        res = subprocess.run(["bash", "-c", check_cmd], capture_output=True)
        # returncode 1 means no active user process found (LSP ignored)
        assert res.returncode == 1
    finally:
        proc.kill()
        proc.wait()


def test_t900306_reap_clears_dead_pid_despite_idle_lsp(repo_root: Path, lsp_env):
    lock_dir, wt, env = lsp_env
    script = repo_root / "scripts" / "agent-lock.sh"

    ts = int(time.time()) - 30
    lf = lock_dir / "ticket__T900306-dead.json"
    lf.write_text(
        json.dumps(
            {
                "scope": "ticket",
                "id": "T900306-dead",
                "owner_sid": "999999",
                "owner_pid": "4194303",
                "tool": "claude",
                "label": "dead-holder",
                "worktree": str(wt),
                "branch": "fix/demo-lsp-reap",
                "created_at": str(ts),
                "heartbeat_at": str(ts),
            }
        )
    )

    proc = subprocess.Popen(["bash", "-c", "exec -a typescript-language-server sleep 30"], cwd=wt)
    time.sleep(0.3)

    try:
        res = subprocess.run(["bash", str(script), "reap"], env=env, capture_output=True)
        assert res.returncode == 0
        assert not lf.exists()
    finally:
        proc.kill()
        proc.wait()
