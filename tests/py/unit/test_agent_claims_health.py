"""Cross-subagent issue gauge (scripts/agent-claims-health.sh)."""

import json


def _claim(run_cmd, repo_root, lock_dir, sid, cid, label, dead=False):
    env = {
        "AGENT_LOCK_DIR": str(lock_dir),
        "AGENT_LOCK_SID": sid,
        "AGENT_LOCK_TOOL": "pytest",
    }
    cmd = ["bash", "scripts/agent-lock.sh", "claim", "ticket", cid, "--label", label]
    if dead:
        # A claim whose worktree path is gone is immediately stale
        # (worktree-missing fast path, no grace period).
        cmd += ["--worktree", "/tmp/agent-claims-health-missing-probe"]
    result = run_cmd(cmd, cwd=repo_root, env=env)
    assert result.returncode == 0, result.output


def _health(run_cmd, repo_root, lock_dir, fake_alive, extra=None):
    env = {"AGENT_LOCK_DIR": str(lock_dir), "AGENT_LOCK_FAKE_ALIVE": fake_alive}
    if extra:
        env.update(extra)
    return run_cmd(["bash", "scripts/agent-claims-health.sh"], cwd=repo_root, env=env)


def test_empty_lock_dir_is_healthy(repo_root, run_cmd, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    result = _health(run_cmd, repo_root, lock_dir, "")
    assert result.returncode == 0, result.output
    assert json.loads(result.stdout)["stale"] == 0


def test_stale_claim_fails_with_counts_and_ids(repo_root, run_cmd, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    _claim(run_cmd, repo_root, lock_dir, "sid-live", "T900001", "worker-a")
    _claim(run_cmd, repo_root, lock_dir, "sid-dead", "T900002", "worker-b", dead=True)
    result = _health(run_cmd, repo_root, lock_dir, "sid-live")
    assert result.returncode == 1, result.output
    payload = json.loads(result.stdout)
    assert (payload["live"], payload["stale"]) == (1, 1)
    stale_ids = [c["id"] for c in payload["claims"] if c["state"] == "stale"]
    assert stale_ids == ["T900002"]


def test_allow_stale_threshold_passes(repo_root, run_cmd, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    _claim(run_cmd, repo_root, lock_dir, "sid-dead", "T900002", "worker-b", dead=True)
    result = _health(
        run_cmd, repo_root, lock_dir, "", {"AGENT_CLAIMS_HEALTH_ALLOW_STALE": "1"}
    )
    assert result.returncode == 0, result.output
    assert json.loads(result.stdout)["stale"] == 1
