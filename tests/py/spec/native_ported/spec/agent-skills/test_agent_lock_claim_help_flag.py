"""Native migration of tests/spec/agent-skills/agent-lock-claim-help-flag.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def lock_env(tmp_path, monkeypatch):
    """Isolated AGENT_LOCK_DIR and deterministic session identity (BATS setup)."""
    lock_dir = tmp_path / "agent-locks"
    lock_dir.mkdir()
    monkeypatch.delenv("CLAUDE_CODE_SESSION_ID", raising=False)
    monkeypatch.delenv("AGENT_LOCK_SID", raising=False)
    return {
        "AGENT_LOCK_DIR": str(lock_dir),
        "CLAUDE_SESSION_ID": "claude-t003107-help-suite",
        "_dir": lock_dir,
    }


def _lock_count(lock_dir: Path) -> int:
    return len([p for p in lock_dir.glob("*.json") if p.is_file()])


def _env(lock_env):
    return {k: v for k, v in lock_env.items() if not k.startswith("_")}


def test_t003107_claim_help_gibt_hilfe_aus_und_legt_keinen_lock_an(run_cmd, repo_root, lock_env):
    lock = str(repo_root / "scripts" / "agent-lock.sh")
    lock_dir = lock_env["_dir"]
    env = _env(lock_env)

    # Positiv-Anker zuerst (T002356-M1)
    r = run_cmd(["bash", lock, "claim", "ticket", "T0031070", "--label", "t003107-anchor"], env=env)
    assert r.returncode == 0
    assert (lock_dir / "ticket__T0031070.json").is_file()
    assert _lock_count(lock_dir) == 1

    # Die eigentliche Zusicherung
    r = run_cmd(["bash", lock, "claim", "--help"], env=env)
    assert r.returncode == 0
    assert not (lock_dir / "--help__.json").exists()
    assert _lock_count(lock_dir) == 1
    assert r.output != ""
    assert re.search(r"--[a-z][a-z-]+", r.output), r.output


def test_t003107_claim_weist_leeren_oder_flag_scope_als_eingabefehler_zurueck(run_cmd, repo_root, lock_env):
    lock = str(repo_root / "scripts" / "agent-lock.sh")
    lock_dir = lock_env["_dir"]
    env = _env(lock_env)

    # Positiv-Anker (T002356-M1)
    r = run_cmd(["bash", lock, "claim", "ticket", "T0031071", "--label", "t003107-anchor2"], env=env)
    assert r.returncode == 0
    assert _lock_count(lock_dir) == 1

    # Leerer Scope: Eingabefehler, kein Lock
    r = run_cmd(["bash", lock, "claim", "", "T0031072"], env=env)
    assert r.returncode != 0
    assert _lock_count(lock_dir) == 1

    # Scope wie ein Flag: Eingabefehler, kein Lock
    r = run_cmd(["bash", lock, "claim", "--bogus-flag"], env=env)
    assert r.returncode != 0
    assert not (lock_dir / "--bogus-flag__.json").exists()
    assert _lock_count(lock_dir) == 1
