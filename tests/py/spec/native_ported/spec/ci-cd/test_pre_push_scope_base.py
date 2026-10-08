"""Native migration of tests/spec/ci-cd/pre-push-scope-base.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest


class _Repo:
    def __init__(self, path: Path):
        self.path = path

    def git(self, *args, check=True) -> str:
        return subprocess.run(["git", *args], cwd=str(self.path), capture_output=True,
                              text=True, check=check).stdout

    def commit(self, subject: str) -> str:
        """_commit: Datei file_<alnum-slug>.txt, Commit mit Betreff, HEAD-SHA zurueck."""
        fname = re.sub(r"[^A-Za-z0-9]", "", subject)[:20]
        (self.path / f"file_{fname}.txt").write_text(subject + "\n")
        self.git("add", f"file_{fname}.txt")
        self.git("commit", "-qm", subject)
        return self.git("rev-parse", "HEAD").strip()

    def seed_remote(self):
        # git push -q -u origin main 2>/dev/null; git fetch -q origin main
        subprocess.run(["git", "push", "-q", "-u", "origin", "main"], cwd=str(self.path),
                       capture_output=True, text=True)
        self.git("fetch", "-q", "origin", "main")


@pytest.fixture
def repo(repo_root, tmp_path):
    testrepo = tmp_path / "repo"
    remote = tmp_path / "remote"
    testrepo.mkdir()
    remote.mkdir()
    subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(testrepo)], check=True)
    r = _Repo(testrepo)
    r.git("config", "user.email", "test@example.invalid")
    r.git("config", "user.name", "Test")
    r.git("config", "commit.gpgsign", "false")
    r.git("remote", "add", "origin", str(remote))
    r.script = repo_root / "scripts/hooks/pre-push-scope-base.sh"
    r.validate = repo_root / "scripts/validate-commit-msg.sh"
    r.repo_root = repo_root
    return r


def test_pre_push_scope_base_sh_exists_and_is_executable(repo):
    assert os.access(repo.script, os.X_OK)


def test_t002827_helper_ignoriert_einen_nicht_ancestor_remote_sha_nach_rebase(run_cmd, repo):
    repo.commit("chore: initial main [T000000]")
    repo.seed_remote()
    repo.git("checkout", "-q", "-b", "feature/test-branch")
    repo.commit("feat(ops): branch commit [T002827]")
    old_remote_sha = repo.git("rev-parse", "HEAD").strip()

    # Remote-main rueckt vor; Branch wird auf den neuen Stand rebased.
    repo.git("checkout", "-q", "main")
    repo.commit("feat(ci): main-only commit [T000000]")
    repo.git("push", "-q", "origin", "main")
    repo.git("fetch", "-q", "origin", "main")
    repo.git("checkout", "-q", "feature/test-branch")
    repo.git("rebase", "-q", "origin/main")
    head_sha = repo.git("rev-parse", "HEAD").strip()

    # Der Helper bekommt genau die Argumente, die .githooks/pre-push uebergibt.
    base = run_cmd(["bash", str(repo.script), head_sha, old_remote_sha], cwd=repo.path).stdout.strip()
    assert base
    assert base != old_remote_sha

    # Die Range base..HEAD darf NUR den Branch-Commit enthalten.
    range_subjects = repo.git("log", "--no-merges", "--format=%s", f"{base}..HEAD").strip()
    assert range_subjects == "feat(ops): branch commit [T002827]"

    # Gegenprobe: wuerde der Helper auf REMOTE_SHA fallen, zoege die Range den main-Only-Commit mit.
    polluted = subprocess.run(["git", "log", "--no-merges", "--format=%s", f"{old_remote_sha}..{head_sha}"],
                              cwd=str(repo.path), capture_output=True, text=True).stdout
    assert "main-only commit" in polluted


def test_t002827_validate_commit_msg_sh_commits_modus_validiert_explizite_shas(run_cmd, repo):
    sha = subprocess.run(["git", "-C", str(repo.repo_root), "rev-parse", "HEAD"],
                         capture_output=True, text=True).stdout.strip()
    assert sha
    res = run_cmd(["bash", str(repo.validate), "commits", sha], cwd=repo.path)
    assert res.returncode == 0
    assert "OK" in res.output


def test_t002827_commits_modus_ohne_shas_ist_ein_usage_fehler(run_cmd, repo):
    res = run_cmd(["bash", str(repo.validate), "commits"], cwd=repo.path)
    assert res.returncode == 2
    assert "usage" in res.output


def test_usage_error_on_missing_head_sha(run_cmd, repo):
    res = run_cmd(["bash", str(repo.script)], cwd=repo.path)
    assert res.returncode == 2
    assert "usage" in res.output


def test_fork_point_base_ist_ein_ancestor_von_head(run_cmd, repo):
    repo.commit("chore: initial main [T000000]")
    repo.seed_remote()
    repo.git("checkout", "-q", "-b", "feature/test-branch")
    repo.commit("feat(ops): branch commit [T002827]")

    head = repo.git("rev-parse", "HEAD").strip()
    base = run_cmd(["bash", str(repo.script), head], cwd=repo.path).stdout.strip()
    res = subprocess.run(["git", "merge-base", "--is-ancestor", base, "HEAD"],
                         cwd=str(repo.path), capture_output=True, text=True)
    assert res.returncode == 0
