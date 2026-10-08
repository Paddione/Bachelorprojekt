"""Native migration of tests/local/AGENT-LOCK-03-precommit.bats."""
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def lock_env(tmp_path, repo_root):
    """Mirror the BATS setup(): private lock dir, TTL and grace settings."""
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    env = {
        "AGENT_LOCK_DIR": str(lock_dir),
        "AGENT_LOCK_TTL": "1800",
        "AGENT_LOCK_GRACE": "0",
    }
    lock = str(repo_root / "scripts" / "agent-lock.sh")
    return {"env": env, "lock": lock, "repo_root": repo_root}


def _lock(run_cmd, env, lock, *args, **extra):
    merged = dict(env)
    merged.update(extra)
    return run_cmd(["bash", lock, *args], env=merged)


def test_guard_precommit_blocks_a_foreign_live_main_checkout_lock(run_cmd, lock_env):
    """AGENT-LOCK-03a: guard-precommit blocks a foreign live main-checkout lock"""
    env, lock = lock_env["env"], lock_env["lock"]
    _lock(run_cmd, env, lock, "claim", "main-checkout",
          AGENT_LOCK_SID="100", AGENT_LOCK_FAKE_ALIVE="100 200").check()
    r = _lock(run_cmd, env, lock, "guard-precommit",
              AGENT_LOCK_SID="200", AGENT_LOCK_FAKE_ALIVE="100 200")
    assert r.returncode == 1
    assert "main-Checkout" in r.output


def test_own_main_checkout_lock_does_not_block(run_cmd, lock_env):
    """AGENT-LOCK-03b: own main-checkout lock does not block"""
    env, lock = lock_env["env"], lock_env["lock"]
    _lock(run_cmd, env, lock, "claim", "main-checkout",
          AGENT_LOCK_SID="100", AGENT_LOCK_FAKE_ALIVE="100").check()
    r = _lock(run_cmd, env, lock, "guard-precommit",
              AGENT_LOCK_SID="100", AGENT_LOCK_FAKE_ALIVE="100")
    assert r.returncode == 0


def test_agent_lock_force_overrides_the_block(run_cmd, lock_env):
    """AGENT-LOCK-03c: AGENT_LOCK_FORCE overrides the block"""
    env, lock = lock_env["env"], lock_env["lock"]
    _lock(run_cmd, env, lock, "claim", "main-checkout",
          AGENT_LOCK_SID="100", AGENT_LOCK_FAKE_ALIVE="100 200").check()
    r = _lock(run_cmd, env, lock, "guard-precommit",
              AGENT_LOCK_SID="200", AGENT_LOCK_FAKE_ALIVE="100 200", AGENT_LOCK_FORCE="1")
    assert r.returncode == 0


def test_no_lock_means_allowed(run_cmd, lock_env):
    """AGENT-LOCK-03d: no lock => allowed"""
    env, lock = lock_env["env"], lock_env["lock"]
    r = _lock(run_cmd, env, lock, "guard-precommit", AGENT_LOCK_SID="200")
    assert r.returncode == 0


def test_dead_foreign_lock_is_reaped_and_allowed(run_cmd, lock_env):
    """AGENT-LOCK-03e: dead foreign lock => reaped => allowed"""
    env, lock = lock_env["env"], lock_env["lock"]
    _lock(run_cmd, env, lock, "claim", "main-checkout",
          AGENT_LOCK_SID="100", AGENT_LOCK_FAKE_ALIVE="100").check()
    r = _lock(run_cmd, env, lock, "guard-precommit",
              AGENT_LOCK_SID="200", AGENT_LOCK_FAKE_ALIVE="200")
    assert r.returncode == 0


def test_real_pre_commit_hook_blocks_in_main_but_not_in_a_worktree(run_cmd, tmp_path, repo_root):
    """AGENT-LOCK-03f: real pre-commit hook blocks in main but not in a worktree"""
    if shutil.which("git") is None:
        pytest.skip("git not available")

    tmprepo = tmp_path / "repo"
    wtx = tmp_path / "wtX"
    tmprepo.mkdir()
    g = ["git", "-C", str(tmprepo)]
    run_cmd(g + ["init", "-q"]).check()
    run_cmd(g + ["config", "user.email", "t@t"]).check()
    run_cmd(g + ["config", "user.name", "t"]).check()
    (tmprepo / ".githooks").mkdir()
    (tmprepo / "scripts").mkdir()

    # Copy agent-lock scripts and the real pre-commit hook.
    for src in sorted((repo_root / "scripts").glob("agent-lock*.sh")):
        shutil.copy2(src, tmprepo / "scripts" / src.name)
    shutil.copy2(repo_root / ".githooks" / "pre-commit", tmprepo / ".githooks" / "pre-commit")

    # Stub out non-agent-lock guards so the hook only exercises the agent-lock gate.
    for s in ["git-crypt-guard.sh", "agent-collision.sh",
              "plan-half-archive-check.sh", "plan-main-staging-guard.sh"]:
        p = tmprepo / "scripts" / s
        p.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
        p.chmod(0o755)
    (tmprepo / ".gitleaks.toml").write_text("", encoding="utf-8")
    (tmprepo / ".githooks" / "pre-commit").chmod(0o755)
    (tmprepo / "scripts" / "agent-lock.sh").chmod(0o755)
    run_cmd(g + ["config", "core.hooksPath", ".githooks"]).check()

    lock_dir = str(tmprepo / ".git" / "agent-locks")
    base_env = {"AGENT_LOCK_DIR": lock_dir}
    lock_script = str(tmprepo / "scripts" / "agent-lock.sh")

    # Need at least one commit so a worktree branch can be created.
    (tmprepo / "seed").write_text("seed\n", encoding="utf-8")
    run_cmd(g + ["add", "seed"]).check()
    run_cmd(g + ["commit", "-q", "-m", "seed"],
            env={**base_env, "AGENT_LOCK_SID": "200", "SKIP_MAIN_COMMIT_GUARD": "1"}).check()

    # Foreign live main-checkout lock.
    run_cmd(["bash", lock_script, "claim", "main-checkout"],
            env={**base_env, "AGENT_LOCK_SID": "100", "AGENT_LOCK_FAKE_ALIVE": "100 200"}).check()
    (tmprepo / "f").write_text("x\n", encoding="utf-8")
    run_cmd(g + ["add", "f"]).check()
    blocked = run_cmd(g + ["commit", "-m", "blocked"],
                      env={**base_env, "AGENT_LOCK_SID": "200",
                           "AGENT_LOCK_FAKE_ALIVE": "100 200",
                           "SKIP_MAIN_COMMIT_GUARD": "1"})
    assert blocked.returncode != 0

    # A linked worktree (git-dir != common-dir) must never be blocked.
    run_cmd(g + ["worktree", "add", "-q", str(wtx), "-b", "wt-branch"]).check()
    (wtx / "g").write_text("y\n", encoding="utf-8")
    wt = ["git", "-C", str(wtx)]
    run_cmd(wt + ["add", "g"]).check()
    allowed = run_cmd(wt + ["commit", "-m", "allowed-in-worktree"],
                      env={**base_env, "AGENT_LOCK_SID": "200",
                           "AGENT_LOCK_FAKE_ALIVE": "100 200"})
    assert allowed.returncode == 0

    run_cmd(g + ["worktree", "remove", "--force", str(wtx)])
