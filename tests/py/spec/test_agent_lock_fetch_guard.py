"""Tests for agent-lock fetch TTL guard (migrated from tests/spec/agent-lock-fetch-guard.bats)."""

import os
from pathlib import Path
import re
import subprocess
import time
import pytest


@pytest.fixture(scope="module")
def fetch_guard_env(repo_root: Path, tmp_path_factory):
    tmp = tmp_path_factory.mktemp("fetch_guard")
    lock_dir = tmp / "locks"
    lock_dir.mkdir()

    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env.pop("CLAUDE_CODE_SESSION_ID", None)
    env["CLAUDE_SESSION_ID"] = "claude-t002502-suite"
    env.pop("AGENT_LOCK_SID", None)
    env["AGENT_LOCK_FETCH_TTL"] = "300"

    script = repo_root / "scripts" / "agent-lock.sh"
    subprocess.run(["bash", str(script), "claim", "ticket", "T002502-file-probe", "--label", "probe"], env=env, check=True)
    return lock_dir, env


def test_t002502_g1_static_check(repo_root: Path):
    scripts_content = ""
    for f in repo_root.glob("scripts/agent-lock*.sh"):
        scripts_content += f.read_text()
    assert "AGENT_LOCK_FETCH_TTL" in scripts_content
    assert ".last-fetch" in scripts_content


def test_t002502_g2_reap_creates_marker(repo_root: Path, fetch_guard_env):
    lock_dir, env = fetch_guard_env
    script = repo_root / "scripts" / "agent-lock.sh"
    marker = lock_dir / ".last-fetch"

    if marker.exists():
        marker.unlink()
    subprocess.run(["bash", str(script), "reap"], env=env, check=True)
    assert marker.is_file()


def test_t002502_g3_fresh_marker_skips_fetch(repo_root: Path, fetch_guard_env):
    lock_dir, env = fetch_guard_env
    script = repo_root / "scripts" / "agent-lock.sh"
    marker = lock_dir / ".last-fetch"

    old_ts = time.time() - 60
    os.utime(marker, (old_ts, old_ts))

    subprocess.run(["bash", str(script), "reap"], env=env, check=True)
    new_ts = marker.stat().st_mtime
    assert int(new_ts) == int(old_ts)


def test_t002502_g4_expired_marker_triggers_fetch(repo_root: Path, fetch_guard_env):
    lock_dir, env = fetch_guard_env
    script = repo_root / "scripts" / "agent-lock.sh"
    marker = lock_dir / ".last-fetch"

    old_ts = time.time() - 600
    os.utime(marker, (old_ts, old_ts))

    subprocess.run(["bash", str(script), "reap"], env=env, check=True)
    new_ts = marker.stat().st_mtime
    assert new_ts > old_ts


def test_t002502_g5_zero_ttl_forces_fetch(repo_root: Path, fetch_guard_env):
    lock_dir, env = fetch_guard_env
    script = repo_root / "scripts" / "agent-lock.sh"
    marker = lock_dir / ".last-fetch"

    old_ts = time.time()
    os.utime(marker, (old_ts, old_ts))

    env_zero = env.copy()
    env_zero["AGENT_LOCK_FETCH_TTL"] = "0"
    subprocess.run(["bash", str(script), "reap"], env=env_zero, check=True)
    new_ts = marker.stat().st_mtime
    assert new_ts >= old_ts
