"""Tests for agent-lock claim persistence (migrated from tests/spec/agent-lock-claim-persist.bats)."""

import os
from pathlib import Path
import subprocess
import time
import pytest


@pytest.fixture
def lock_env(tmp_path: Path):
    env = os.environ.copy()
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env.pop("CLAUDE_CODE_SESSION_ID", None)
    env["CLAUDE_SESSION_ID"] = "claude-t001384-suite"
    env.pop("AGENT_LOCK_SID", None)
    return lock_dir, env


def test_reap_leaves_live_sid_claim_untouched(repo_root: Path, lock_env):
    lock_dir, env = lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    res = subprocess.run(
        [
            "bash",
            str(script),
            "claim",
            "branch",
            "fix/t001384-agent-lock-claim-persist",
            "--worktree",
            "/tmp/wt-that-definitely-does-not-exist-12345",
            "--label",
            "dev-flow-plan",
        ],
        env=env,
        capture_output=True,
    )
    assert res.returncode == 0
    lock_file = lock_dir / "branch__fix-t001384-agent-lock-claim-persist.json"
    assert lock_file.is_file()

    res_reap = subprocess.run(["bash", str(script), "reap"], env=env, capture_output=True)
    assert res_reap.returncode == 0
    assert lock_file.is_file()

    reap_log = lock_dir / ".reap.log"
    if reap_log.exists():
        assert "branch/fix-t001384-agent-lock-claim-persist worktree-missing" not in reap_log.read_text()


def test_list_shows_live_claim_with_missing_worktree(repo_root: Path, lock_env):
    lock_dir, env = lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    subprocess.run(
        [
            "bash",
            str(script),
            "claim",
            "branch",
            "fix/t001384-list-probe",
            "--worktree",
            "/tmp/wt-list-probe-missing",
            "--label",
            "probe",
        ],
        env=env,
        check=True,
    )
    res = subprocess.run(["bash", str(script), "list"], env=env, capture_output=True, text=True)
    assert res.returncode == 0
    match = [line for line in res.stdout.splitlines() if "fix/t001384-list-probe" in line]
    assert match, "branch not found in list"
    assert "live" in match[0]


def test_cmd_reap_holds_registry_flock(repo_root: Path, lock_env):
    lock_dir, env = lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    lock_holder = subprocess.Popen(
        ["bash", "-c", f"exec 9>'{lock_dir}/.registry.lock'; flock 9; sleep 1.2"]
    )
    time.sleep(0.15)

    start = time.time()
    subprocess.run(["bash", str(script), "reap"], env=env, capture_output=True)
    elapsed = time.time() - start

    lock_holder.wait()
    assert elapsed >= 0.8, f"cmd_reap took only {elapsed}s, registry lock not respected"


def test_claim_survives_parallel_reap(repo_root: Path, lock_env):
    lock_dir, env = lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    for i in range(1, 6):
        p_claim = subprocess.Popen(
            [
                "bash",
                str(script),
                "claim",
                "branch",
                f"fix/t001384-race-{i}",
                "--worktree",
                f"/tmp/wt-race-missing-{i}",
                "--label",
                "race",
            ],
            env=env,
        )
        p_reap = subprocess.Popen(["bash", str(script), "reap"], env=env)
        p_claim.wait()
        p_reap.wait()
        lock_file = lock_dir / f"branch__fix-t001384-race-{i}.json"
        assert lock_file.is_file(), f"Round {i}: claim missing after reap"


def test_lock_dir_uses_show_toplevel_as_anchor(repo_root: Path):
    script = (repo_root / "scripts" / "agent-lock.sh").read_text()
    assert "git rev-parse --show-toplevel" in script or "git rev-parse --show-toplevel" in " ".join(
        script.split()
    )


def test_second_claim_from_other_session_rejected(repo_root: Path, lock_env):
    lock_dir, env = lock_env
    script = repo_root / "scripts" / "agent-lock.sh"

    subprocess.run(["bash", str(script), "claim", "ticket", "T001384-regression", "--label", "first"], env=env, check=True)
    lock_file = lock_dir / "ticket__T001384-regression.json"
    assert lock_file.is_file()

    env_b = env.copy()
    env_b["CLAUDE_SESSION_ID"] = "claude-other-session"
    res = subprocess.run(["bash", str(script), "claim", "ticket", "T001384-regression", "--label", "second"], env=env_b, capture_output=True, text=True)
    assert res.returncode == 1
    assert "bereits gehalten" in res.stdout or "bereits gehalten" in res.stderr
