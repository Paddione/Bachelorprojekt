"""Native migration of tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats."""

import os
import shutil
import subprocess

import pytest


@pytest.fixture
def win_env(repo_root, tmp_path, monkeypatch):
    """BATS setup(): real repo plus a git shim that reports a Windows drive path."""
    real_git = shutil.which("git")
    assert real_git, "git nicht gefunden"
    monkeypatch.setenv("AGENT_LOCK_FETCH_TTL", "99999")
    monkeypatch.setenv("AGENT_LOCK_SID", "sid-T900023")
    monkeypatch.delenv("AGENT_LOCK_DIR", raising=False)

    repo = tmp_path / "repo"
    repo.mkdir()
    for args in (["init", "-q"], ["config", "user.email", "t@example.com"],
                 ["config", "user.name", "test"], ["commit", "-q", "--allow-empty", "-m", "init"]):
        subprocess.run([real_git, "-C", str(repo), *args], check=True)

    shim_dir = tmp_path / "shim"
    shim_dir.mkdir()
    shim = shim_dir / "git"
    shim.write_text(
        "#!/usr/bin/env bash\n"
        'if [ "$1" = "rev-parse" ]; then\n'
        '  for a in "$@"; do\n'
        '    if [ "$a" = "--git-common-dir" ]; then printf \'C:/fake/repo/.git\\n\'; exit 0; fi\n'
        "  done\n"
        "fi\n"
        f'exec "{real_git}" "$@"\n'
    )
    shim.chmod(0o755)
    monkeypatch.setenv("PATH", f"{shim_dir}:" + os.environ["PATH"])
    return {"lock": str(repo_root / "scripts" / "agent-lock.sh"), "repo": repo}


def test_list_does_not_fail_to_resolve_the_lock_dir_when_git_reports_a_windows_drive_path(run_cmd, win_env):
    r = run_cmd(["bash", win_env["lock"], "list"], cwd=win_env["repo"])
    assert "No such file or directory" not in r.output


def test_list_still_completes_its_own_logic_under_a_windows_drive_path(run_cmd, win_env):
    r = run_cmd(["bash", win_env["lock"], "list"], cwd=win_env["repo"])
    assert r.returncode == 0
    assert "SCOPE" in r.output or "keine aktiven Claims" in r.output
