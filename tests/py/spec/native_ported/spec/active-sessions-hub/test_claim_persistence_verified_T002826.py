"""Native migration of tests/spec/active-sessions-hub/claim-persistence-verified-T002826.bats."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def lock_script(repo_root, monkeypatch):
    """BATS setup(): stable SID per run, no fetch/reap overhead."""
    monkeypatch.setenv("AGENT_LOCK_SID", f"session-persist-{os.getpid()}")
    monkeypatch.setenv("AGENT_LOCK_FETCH_TTL", "99999")
    monkeypatch.delenv("AGENT_LOCK_DIR", raising=False)
    yield str(repo_root / "scripts" / "agent-lock.sh")
    # BATS teardown(): fallback registry in /tmp must not survive the run.
    Path("/tmp/agent-locks", f"ticket__TPERSIST3-{os.getpid()}.json").unlink(missing_ok=True)


def test_claim_reports_a_non_zero_exit_when_the_lock_file_cannot_be_persisted(run_cmd, lock_script, tmp_path, monkeypatch):
    ok_dir = tmp_path / "ok"
    monkeypatch.setenv("AGENT_LOCK_DIR", str(ok_dir))
    r = run_cmd(["bash", lock_script, "claim", "ticket", "TPERSIST1", "--label", "probe", "--worktree", str(tmp_path)])
    assert r.returncode == 0
    assert (ok_dir / "ticket__TPERSIST1.json").is_file()

    # Lock dir below a regular file: mkdir -p and the tmp write fail (ENOTDIR, also as root).
    blocker = tmp_path / "blocker"
    blocker.touch()
    locks = blocker / "locks"
    monkeypatch.setenv("AGENT_LOCK_DIR", str(locks))
    r = run_cmd(["bash", lock_script, "claim", "ticket", "TPERSIST2", "--label", "probe", "--worktree", str(tmp_path)])
    assert r.returncode != 0
    assert not (locks / "ticket__TPERSIST2.json").exists()


def test_claim_makes_the_tmp_agent_locks_fallback_visible_instead_of_diverging_silently(run_cmd, lock_script, tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    ident = ["-c", "user.email=t@example.com", "-c", "user.name=test"]
    run_cmd(["git", "-C", str(repo), "init", "-q"]).check()
    run_cmd(["git", "-C", str(repo), *ident, "commit", "-q", "--allow-empty", "-m", "init"]).check()
    monkeypatch.delenv("AGENT_LOCK_DIR", raising=False)
    suffix = f"TPERSIST3-{os.getpid()}"

    r = run_cmd(["bash", "-c", f"cd '{repo}' && bash '{lock_script}' claim ticket {suffix} --label probe"])
    assert r.returncode == 0
    assert (repo / ".git" / "agent-locks" / f"ticket__{suffix}.json").is_file()
    assert "/tmp/agent-locks" not in r.output

    nogit = tmp_path / "nogit"
    nogit.mkdir()
    r = run_cmd(
        ["bash", "-c", f"cd '{nogit}' && GIT_CEILING_DIRECTORIES='{tmp_path}' bash '{lock_script}' claim ticket {suffix} --label probe"]
    )
    assert "/tmp/agent-locks" in r.output
