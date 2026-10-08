"""Native migration of tests/spec/agent-skills/nightly-vendor-sync.bats."""

import os
import re
from pathlib import Path

import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@example.invalid",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@example.invalid",
    "GIT_CONFIG_GLOBAL": "/dev/null",
}

GH_STUB_OK = """#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
if [ "$1 $2" = "pr list" ]; then
  [ -f "$GH_OPEN_HEADS" ] && cat "$GH_OPEN_HEADS"
  exit 0
fi
if [ "$1 $2" = "pr create" ]; then
  echo "https://example.invalid/pr/1"
  exit 0
fi
exit 0
"""

GH_STUB_FAIL = """#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
exit 1
"""


class Sandbox:
    def __init__(self, run_cmd, repo_root, tmp_path):
        self.run_cmd = run_cmd
        self.repo = repo_root
        self.t = tmp_path
        self.script = repo_root / "scripts/nightly-vendor-sync.sh"
        self.origin = self.t / "origin.git"
        self.main = self.t / "main-checkout"
        self.bin = self.t / "bin"
        self.gh_log = self.t / "gh.log"
        self.gh_open = self.t / "open-heads.txt"
        self.wt = self.t / "wt" / "nightly"
        self.env = dict(GIT_ENV)
        self.env.update({
            "GH_LOG": str(self.gh_log),
            "GH_OPEN_HEADS": str(self.gh_open),
            "REPO_DIR": str(self.main),
            "NIGHTLY_WT_DIR": str(self.wt),
        })

    def git(self, *args, cwd=None):
        return self.run_cmd(["git", *args], cwd=cwd, env=self.env)

    def setup(self):
        self.git("init", "-q", "--bare", "-b", "main", str(self.origin)).check()
        self.main.mkdir()
        self.git("init", "-q", "-b", "main", str(self.main)).check()
        (self.main / "vendored.txt").write_text("v1\n", encoding="utf-8")
        self.git("-C", str(self.main), "add", "-A").check()
        self.git("-C", str(self.main), "commit", "-qm", "init").check()
        self.git("-C", str(self.main), "remote", "add", "origin", str(self.origin)).check()
        self.git("-C", str(self.main), "push", "-q", "-u", "origin", "main").check()
        self.bin.mkdir()
        self.write_gh(GH_STUB_OK)
        self.gh_log.write_text("", encoding="utf-8")
        self.env["PATH"] = f"{self.bin}:{os.environ.get('PATH', '')}"

    def write_gh(self, content):
        gh = self.bin / "gh"
        gh.write_text(content, encoding="utf-8")
        gh.chmod(0o755)

    def run_script(self, update_cmd, **extra):
        self.env["NIGHTLY_UPDATE_CMD"] = update_cmd
        self.env.update(extra)
        return self.run_cmd(["bash", str(self.script)], env=self.env)

    def branches_on_origin(self):
        r = self.git(
            "-C", str(self.origin), "for-each-ref", "--format=%(refname:short)",
            "refs/heads/chore/nightly-vendor-sync-T900454-*",
        )
        return r.stdout.strip()

    def main_status(self):
        return self.git("-C", str(self.main), "status", "--porcelain").stdout.strip()


@pytest.fixture
def sb(run_cmd, repo_root, tmp_path):
    s = Sandbox(run_cmd, repo_root, tmp_path)
    s.setup()
    return s


def test_t900454_upstream_aenderung_landet_auf_branch_mit_pr_hauptcheckout_bleibt_unberuehrt(sb):
    r = sb.run_script('printf "v2\\n" > vendored.txt; printf "neu\\n" > added.txt')
    assert r.returncode == 0, r.output

    # Positiv-Anker: die Aenderung liegt auf genau einem Nightly-Branch auf origin.
    branches = [b for b in sb.branches_on_origin().splitlines() if b]
    assert len(branches) == 1
    branch = branches[0]
    assert sb.git("-C", str(sb.origin), "show", f"{branch}:vendored.txt").stdout.strip() == "v2"
    assert sb.git("-C", str(sb.origin), "show", f"{branch}:added.txt").stdout.strip() == "neu"
    gh_log = sb.gh_log.read_text(encoding="utf-8")
    assert "pr create" in gh_log
    assert f"--head {branch}" in gh_log

    # Der Hauptcheckout ist sauber, steht auf main und traegt den alten Inhalt.
    assert sb.main_status() == ""
    assert sb.git("-C", str(sb.main), "rev-parse", "--abbrev-ref", "HEAD").stdout.strip() == "main"
    assert (sb.main / "vendored.txt").read_text(encoding="utf-8").strip() == "v1"
    assert not (sb.main / "added.txt").exists()

    # Worktree und lokaler Branch sind wieder weg.
    assert not sb.wt.exists()
    assert sb.git("-C", str(sb.main), "branch", "--list", "chore/nightly-vendor-sync-*").stdout.strip() == ""


def test_t900454_ohne_upstream_aenderung_entsteht_weder_branch_noch_pr(sb):
    marker = sb.t / "update-ran"
    r = sb.run_script('touch "$MARKER"', MARKER=str(marker))
    assert r.returncode == 0, r.output

    # Positiv-Anker: der Updater lief tatsaechlich.
    assert marker.exists()

    assert sb.branches_on_origin() == ""
    assert "pr create" not in sb.gh_log.read_text(encoding="utf-8")
    assert sb.main_status() == ""
    assert not sb.wt.exists()


def test_t900454_ein_offener_nightly_pr_verhindert_einen_zweiten_lauf(sb):
    sb.gh_open.write_text(
        "feature/anderes-T000001\nchore/nightly-vendor-sync-T900454-20260101\n", encoding="utf-8"
    )
    marker = sb.t / "update-ran"
    r = sb.run_script('touch "$MARKER"; printf "v2\\n" > vendored.txt', MARKER=str(marker))
    assert r.returncode == 0, r.output

    # Positiv-Anker: die PR-Abfrage lief.
    assert "pr list" in sb.gh_log.read_text(encoding="utf-8")

    assert not marker.exists()
    assert sb.branches_on_origin() == ""


def test_t900454_schlaegt_die_pr_abfrage_fehl_bricht_der_lauf_ab_statt_blind_einzureichen(sb):
    sb.write_gh(GH_STUB_FAIL)
    marker = sb.t / "update-ran"
    r = sb.run_script('touch "$MARKER"', MARKER=str(marker))
    assert r.returncode == 1
    assert "pr list" in sb.gh_log.read_text(encoding="utf-8")
    assert not marker.exists()
    assert sb.branches_on_origin() == ""


def test_t900454_nightly_update_sh_ruft_den_worktree_lauf_auf_und_wechselt_nicht_in_den_hauptcheckout(repo_root):
    update = repo_root / "scripts/nightly-update.sh"
    text = update.read_text(encoding="utf-8")
    assert "scripts/nightly-vendor-sync.sh" in text
    cd_into_repo = [
        f"{n}:{line}"
        for n, line in enumerate(text.splitlines(), start=1)
        if re.search(r'^\s*cd\s+"?\$\{?REPO_DIR', line)
    ]
    assert cd_into_repo == []
