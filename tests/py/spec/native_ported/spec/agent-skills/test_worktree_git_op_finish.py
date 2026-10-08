"""Native migration of tests/spec/agent-skills/worktree-git-op-finish.bats."""

import os
from pathlib import Path

import pytest


class Fixture:
    """BATS-_make_fixture-Nachbau: Repo mit linked worktree in einem der drei Zustaende."""

    def __init__(self, run_cmd, repo_root, tmp_path):
        self.run_cmd = run_cmd
        self.guard = repo_root / "scripts/worktree-git-op-guard.sh"
        self.base = tmp_path / "fixture"
        self.wt = tmp_path / "wt"

    def git(self, *args, check=False):
        r = self.run_cmd(["git", *args])
        if check:
            r.check()
        return r

    def build(self, mode="clean"):
        self.base.mkdir(parents=True)
        self.git("-C", str(self.base), "init", "-q", "-b", "main", ".", check=True)
        self.git("-C", str(self.base), "config", "user.email", "t@example.invalid", check=True)
        self.git("-C", str(self.base), "config", "user.name", "T", check=True)
        data = self.base / "components/website/src/data"
        data.mkdir(parents=True)
        (data / "test-inventory.json").write_text("base\n", encoding="utf-8")
        self.git("-C", str(self.base), "add", "-A", check=True)
        self.git("-C", str(self.base), "commit", "-qm", "base", check=True)
        self.git("-C", str(self.base), "branch", "feat", check=True)
        (data / "test-inventory.json").write_text("mainside\n", encoding="utf-8")
        self.git("-C", str(self.base), "commit", "-qam", "mainside", check=True)

        self.git("-C", str(self.base), "worktree", "add", "-q", str(self.wt), "feat", check=True)
        if mode == "clean":
            return

        wt_file = self.wt / "components/website/src/data/test-inventory.json"
        wt_file.write_text("feat\n", encoding="utf-8")
        self.git("-C", str(self.wt), "commit", "-qam", "feat", check=True)
        if mode == "--mid-rebase":
            self.git("-C", str(self.wt), "rebase", "main")
            wt_file.write_text("resolved\n", encoding="utf-8")
            self.git("-C", str(self.wt), "add", "components/website/src/data/test-inventory.json", check=True)
        elif mode == "--mid-rebase-conflict":
            self.git("-C", str(self.wt), "rebase", "main")
        elif mode == "--mid-merge":
            self.git("-C", str(self.wt), "merge", "main")
        else:
            raise ValueError(mode)

    def git_path(self, name):
        return self.git("-C", str(self.wt), "rev-parse", "--git-path", name).stdout.strip()

    def rebase_dir(self):
        return self.git_path("rebase-merge")

    def guard_finish(self):
        return self.run_cmd(["bash", str(self.guard), "--finish", str(self.base)])


@pytest.fixture
def fx(run_cmd, repo_root, tmp_path):
    return Fixture(run_cmd, repo_root, tmp_path)


def test_t015784_finish_auf_einem_sauberen_fixture_endet_mit_exit_0(fx):
    fx.build()
    r = fx.guard_finish()
    assert r.returncode == 0, r.output


def test_t015784_finish_schliesst_den_geloesten_rebase_ab_zustandsverzeichnis_verschwindet(fx):
    fx.build("--mid-rebase")
    state = fx.rebase_dir()
    assert os.path.isdir(state)
    r = fx.guard_finish()
    assert r.returncode == 0, r.output
    assert not os.path.isdir(state)


def test_t015784_nach_finish_zeigt_der_branch_ref_auf_denselben_commit_wie_head(fx):
    fx.build("--mid-rebase")
    r = fx.guard_finish()
    assert r.returncode == 0, r.output
    head_sha = fx.git("-C", str(fx.wt), "rev-parse", "HEAD").stdout.strip()
    branch_sha = fx.git("-C", str(fx.wt), "rev-parse", "feat").stdout.strip()
    assert head_sha == branch_sha


def test_t015784_finish_fasst_einen_rebase_mit_offenen_konflikten_nicht_an(fx):
    fx.build("--mid-rebase-conflict")
    state = fx.rebase_dir()
    assert os.path.isdir(state)
    r = fx.guard_finish()
    assert r.returncode != 0
    assert os.path.isdir(state)


def test_t015784_finish_fasst_einen_unterbrochenen_merge_nicht_an(fx):
    fx.build("--mid-merge")
    merge_head = fx.git_path("MERGE_HEAD")
    assert os.path.isfile(merge_head)
    r = fx.guard_finish()
    assert r.returncode != 0
    assert os.path.isfile(merge_head)


def test_t015784_finish_fasst_einen_rebase_mit_nicht_allowlisteter_abweichung_nicht_an(fx):
    fx.build("--mid-rebase")
    state = fx.rebase_dir()
    (fx.wt / "eigene-quelldatei.txt").write_text("unerwartete arbeit\n", encoding="utf-8")
    r = fx.guard_finish()
    assert r.returncode != 0
    assert os.path.isdir(state)


def test_t015784_ohne_finish_bleibt_der_rebase_zustand_unveraendert_bestehen(fx, run_cmd):
    fx.build("--mid-rebase")
    state = fx.rebase_dir()
    r = run_cmd(["bash", str(fx.guard), str(fx.base)])
    assert r.returncode != 0
    assert os.path.isdir(state)
