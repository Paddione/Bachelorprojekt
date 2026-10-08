"""Native migration of tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats."""

import os
import subprocess
import time

import pytest


@pytest.fixture
def activity_repo(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated lock dir and a repo with one empty commit."""
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    monkeypatch.setenv("AGENT_LOCK_FETCH_TTL", "99999")
    repo = tmp_path / "repo"
    repo.mkdir()
    for args in (["init", "-q"], ["config", "user.email", "t@example.com"],
                 ["config", "user.name", "test"], ["commit", "-q", "--allow-empty", "-m", "init"]):
        subprocess.run(["git", "-C", str(repo), *args], check=True)
    return {"lock": str(repo_root / "scripts" / "agent-lock.sh"), "repo": repo}


def _alive_cwd(pid):
    try:
        return os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        return ""


def test_activity_reports_a_session_working_in_the_repo_that_has_not_committed_yet(run_cmd, activity_repo):
    if not os.path.isdir("/proc/self"):
        pytest.skip("/proc nicht verfuegbar")
    repo = str(activity_repo["repo"])
    lock = activity_repo["lock"]
    worker = subprocess.Popen(["sleep", "30"], cwd=repo)
    try:
        for _ in range(10):
            if _alive_cwd(worker.pid) == repo:
                break
            time.sleep(0.2)
        assert _alive_cwd(worker.pid) == repo

        r = run_cmd(["bash", "-c", f"cd '{repo}' && bash '{lock}' list"])
        assert r.returncode == 0
        assert str(worker.pid) not in r.output

        r = run_cmd(["bash", "-c", f"cd '{repo}' && bash '{lock}' activity"])
        assert r.returncode == 0
        assert str(worker.pid) in r.output

        worker.kill()
        worker.wait()
        r = run_cmd(["bash", "-c", f"cd '{repo}' && bash '{lock}' activity"])
        assert r.returncode == 0
        assert str(worker.pid) not in r.output
    finally:
        if worker.poll() is None:
            worker.kill()
            worker.wait()


def test_activity_does_not_report_its_own_invoking_process_as_foreign_activity(run_cmd, activity_repo):
    repo = str(activity_repo["repo"])
    r = run_cmd(["bash", "-c", f"cd '{repo}' && bash '{activity_repo['lock']}' activity"])
    assert r.returncode == 0
    assert f" {os.getpid()} " not in r.output
