"""Native migration of tests/spec/scripts/check-worktree-live-no-env.bats."""

import os
import subprocess
from pathlib import Path

import pytest

# Prüfmodus: command output verification.
#
# Regression: `_worktree_is_live_claimed` las `$AGENT_LOCK_DIR` direkt statt
# `_lock_dir()`. Unter `set -u` brach `check-worktree-live` damit ab, sobald der
# Aufrufer die Variable nicht exportierte — und worktree-clean-check.sh las den
# Abbruch als "nicht live claimed", hielt also einen fremd gehaltenen Worktree
# für löschbar. Die Bestandstests bemerkten das nicht, weil sie AGENT_LOCK_DIR
# selbst setzen. Dieser Test läuft deshalb bewusst OHNE die Variable — dieselbe
# festhält: mindestens ein Fall darf die Variable nicht vorsetzen.


@pytest.fixture
def tmp_repo(tmp_path, run_cmd):
    """setup(): throwaway repo with one empty commit under TMP/r."""
    repo = tmp_path / "r"
    run_cmd(["git", "init", "-q", str(repo)]).check()
    run_cmd(["git", "-C", str(repo), "config", "user.email", "t@e.com"]).check()
    run_cmd(["git", "-C", str(repo), "config", "user.name", "T"]).check()
    run_cmd(["git", "-C", str(repo), "commit", "-q", "--allow-empty", "-m", "init"]).check()
    return repo


def _unset_run(run_cmd, repo_root: Path, cwd: Path, *args):
    """env -u AGENT_LOCK_DIR bash agent-lock.sh ... (run from cwd)."""
    return run_cmd(["env", "-u", "AGENT_LOCK_DIR", "bash",
                    str(repo_root / "scripts/agent-lock.sh"), *args], cwd=cwd)


def test_check_worktree_live_antwortet_ohne_gesetztes_agent_lock_dir(run_cmd, repo_root, tmp_repo):
    result = _unset_run(run_cmd, repo_root, tmp_repo, "check-worktree-live", str(tmp_repo))
    # Die Zusicherung ist die Antwort selbst: 'free' oder 'live', nicht ein
    # Bash-Fehler. Vor dem Fix stand hier "AGENT_LOCK_DIR: unbound variable".
    assert result.output in ("free", "live")
    assert "unbound variable" not in result.output


def test_check_worktree_live_meldet_einen_fremd_gehaltenen_worktree_als_live_positiv_anker(
        run_cmd, repo_root, tmp_repo):
    lockdir = tmp_repo / ".git" / "agent-locks"
    lockdir.mkdir(parents=True, exist_ok=True)
    now = int(__import__("time").time())
    (lockdir / "branch__probe.json").write_text(
        "{\n"
        '  "scope": "branch",\n'
        '  "id": "probe",\n'
        '  "owner_sid": "fremde-session",\n'
        f'  "owner_pid": "{os.getpid()}",\n'
        '  "tool": "claude",\n'
        '  "label": "test",\n'
        f'  "worktree": "{tmp_repo}",\n'
        '  "branch": "probe",\n'
        '  "ticket": "",\n'
        '  "host": "testhost",\n'
        f'  "created_at": "{now}",\n'
        f'  "heartbeat_at": "{now}"\n'
        "}\n")
    result = _unset_run(run_cmd, repo_root, tmp_repo, "check-worktree-live", str(tmp_repo))
    assert result.output == "live"
    assert result.returncode == 0
