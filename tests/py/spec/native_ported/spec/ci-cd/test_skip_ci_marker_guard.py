"""Native migration of tests/spec/ci-cd/skip-ci-marker-guard.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest

SKIP_MARKER_RE = r"\[skip ci\]|\[ci skip\]|\[no ci\]|\[skip actions\]|\[actions skip\]"


class _Env:
    def __init__(self, repo_root: Path, tmp: Path):
        self.repo_root = repo_root
        self.tmp = tmp
        self.home = tmp / "home"
        self.home.mkdir()
        self.gitconfig = self.home / ".gitconfig"
        self.gitconfig.write_text("")
        self.env = dict(os.environ)
        self.env.update({
            "HOME": str(self.home),
            "GIT_CONFIG_GLOBAL": str(self.gitconfig),
            "WT_SKIP_NAME_CHECK": "1",  # Suite testet Commit-Messages, nicht Benennung
        })
        self.helper = repo_root / "scripts/worktree-create.sh"
        self.guard = repo_root / "scripts/check-skip-ci-marker.sh"
        self.main = tmp / "main"
        self.main.mkdir()
        self.git("init", "-q", "-b", "main", str(self.main), cwd=tmp)
        self.git("-C", str(self.main), "config", "user.email", "t@example.com")
        self.git("-C", str(self.main), "config", "user.name", "Tester")
        (self.main / "README.md").write_text("seed\n")
        self.git("-C", str(self.main), "add", "-A")
        self.git("-C", str(self.main), "commit", "-qm", "init")

    def git(self, *args, cwd=None) -> subprocess.CompletedProcess:
        return subprocess.run(["git", *args], cwd=str(cwd or self.main), env=self.env,
                              capture_output=True, text=True, check=True)

    def mgit(self, *args):
        """git -C MAIN ..."""
        return self.git("-C", str(self.main), *args)


@pytest.fixture
def e(repo_root, tmp_path):
    return _Env(repo_root, tmp_path)


def _guard(run_cmd, e):
    # run bash -c "cd MAIN && bash GUARD main HEAD"; BATS run merged stderr.
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", "-c",
                    f"cd '{e.main}' && bash '{e.guard}' main HEAD"], cwd=e.main, env=e.env)


def test_worktree_create_writes_an_anchor_commit_without_a_ci_skip_marker(run_cmd, e):
    wt = e.tmp / "wt-anchor"
    res = run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", "-c",
                   f"cd '{e.main}' && bash '{e.helper}' fix/anchor-check '{wt}' HEAD"],
                  cwd=e.main, env=e.env)
    assert res.returncode == 0

    # Positiv-Anker: der Anker-Commit muss EXISTIEREN.
    subj = run_cmd(["git", "-C", str(wt), "log", "--format=%s", "-1"], cwd=e.main, env=e.env)
    assert subj.returncode == 0
    assert "anchor branch" in subj.output

    # Die eigentliche Aussage: die volle Message traegt keinen Skip-Marker.
    body = run_cmd(["git", "-C", str(wt), "log", "--format=%B", "-1"], cwd=e.main, env=e.env)
    assert body.returncode == 0
    assert not re.search(SKIP_MARKER_RE, body.output, re.IGNORECASE)


def test_guard_script_exists_and_is_executable(e):
    assert os.access(e.guard, os.X_OK)


def test_guard_rejects_a_branch_commit_carrying_a_skip_marker_and_names_it(run_cmd, e):
    e.mgit("checkout", "-q", "-b", "fix/offender")
    e.mgit("commit", "-q", "--allow-empty", "-m", "chore: anchor branch fix/offender [skip ci]")
    e.mgit("commit", "-q", "--allow-empty", "-m", "fix: the actual change")
    res = _guard(run_cmd, e)
    assert res.returncode != 0
    assert "fix/offender" in res.output


def test_guard_rejects_every_github_skip_marker_spelling_not_just_skip_ci(run_cmd, e):
    for marker in ["[ci skip]", "[no ci]", "[skip actions]", "[actions skip]"]:
        e.mgit("checkout", "-q", "main")
        branch = "fix/spelling-" + re.sub(r"[^a-z]", "", marker)
        e.mgit("checkout", "-q", "-b", branch)
        e.mgit("commit", "-q", "--allow-empty", "-m", f"chore: something {marker}")
        res = _guard(run_cmd, e)
        # Positiv-Anker: ein FEHLENDER Guard endet auch != 0 (127). Der Guard muss laufen.
        assert res.returncode != 0, f"guard accepted the marker '{marker}'"
        assert res.returncode != 127, f"guard did not run at all (127) for marker '{marker}'"
        assert "CI skip marker found" in res.output, f"guard produced no verdict for marker '{marker}'"
        assert marker in res.output, f"guard did not echo the offending subject for marker '{marker}'"


def test_guard_accepts_a_branch_whose_commits_carry_no_marker(run_cmd, e):
    e.mgit("checkout", "-q", "-b", "fix/clean")
    e.mgit("commit", "-q", "--allow-empty", "-m", "chore: anchor branch fix/clean")
    e.mgit("commit", "-q", "--allow-empty", "-m", "fix: the actual change")
    res = _guard(run_cmd, e)
    assert res.returncode == 0


def test_guard_ignores_markers_that_are_already_on_main_bot_commits(run_cmd, e):
    # freshness-regen.yml committet bewusst direkt auf main MIT Marker (Loop-Schutz).
    e.mgit("commit", "-q", "--allow-empty", "-m", "chore: auto-regenerate freshness artifacts [skip ci]")
    e.mgit("checkout", "-q", "-b", "fix/after-bot")
    e.mgit("commit", "-q", "--allow-empty", "-m", "fix: unrelated change")
    res = _guard(run_cmd, e)
    assert res.returncode == 0


def test_ci_yml_invokes_the_skip_marker_guard(repo_root):
    # Quelltext-Pruefung ist hier korrekt: die Aussage betrifft die CI-Konfiguration selbst.
    text = (repo_root / ".github/workflows/ci.yml").read_text()
    count = sum(1 for ln in text.splitlines() if "check-skip-ci-marker.sh" in ln)
    assert count >= 1
