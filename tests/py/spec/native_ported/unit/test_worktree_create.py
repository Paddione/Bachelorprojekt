"""Native migration of tests/unit/worktree-create.bats."""
import os
import re
import shlex
import stat
from pathlib import Path

import pytest

FAKE_GIT_CRYPT = """#!/usr/bin/env bash
# usage: fake-git-crypt.sh <smudge|clean>
gd="${GIT_DIR:-$(git rev-parse --absolute-git-dir 2>/dev/null)}"
if [ ! -f "$gd/git-crypt/keys/default" ]; then
  echo "fake-git-crypt: Error: Unable to open key file" >&2
  exit 1
fi
cat
"""

GITCRYPT_BLOB = b"\x00GITCRYPT\x00BINARY-CIPHERTEXT"


class Sandbox:
    """Isolated git sandbox: fake git-crypt filter, unlocked main checkout, helper script."""

    def __init__(self, repo_root: Path, run_cmd, tmp: Path):
        self.tmp = tmp
        self.helper = repo_root / "scripts" / "worktree-create.sh"
        self._run_cmd = run_cmd
        home = tmp / "home"
        home.mkdir()
        gitconfig = home / ".gitconfig"
        gitconfig.write_text("", encoding="utf-8")
        self.env = {
            "WT_SKIP_NAME_CHECK": "1",
            "HOME": str(home),
            "GIT_CONFIG_GLOBAL": str(gitconfig),
        }

        self.fake = tmp / "fake-git-crypt.sh"
        self.fake.write_text(FAKE_GIT_CRYPT, encoding="utf-8")
        self.fake.chmod(self.fake.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        self.main = tmp / "main"
        self.main.mkdir()
        self.git("init", "-q", "-b", "main", str(self.main)).check()
        self.git("-C", str(self.main), "config", "user.email", "t@example.com").check()
        self.git("-C", str(self.main), "config", "user.name", "Tester").check()
        self.git("-C", str(self.main), "config", "filter.git-crypt.smudge", f"{self.fake} smudge").check()
        self.git("-C", str(self.main), "config", "filter.git-crypt.clean", f"{self.fake} clean").check()
        self.git("-C", str(self.main), "config", "filter.git-crypt.required", "true").check()
        (self.main / ".gitattributes").write_text(
            "secret/** filter=git-crypt diff=git-crypt\n", encoding="utf-8"
        )
        (self.main / "secret").mkdir()
        (self.main / "secret" / "data.yaml").write_text("TOPSECRET-VALUE\n", encoding="utf-8")
        # "unlock" the main checkout: install the key in the main gitdir.
        self.install_key(self.main)
        self.git("-C", str(self.main), "add", "-A").check()
        self.git("-C", str(self.main), "commit", "-qm", "init").check()

    def git(self, *args: str):
        return self._run_cmd(["git", *args], env=self.env, timeout=300)

    def install_key(self, repo: Path) -> None:
        keys = repo / ".git" / "git-crypt" / "keys"
        keys.mkdir(parents=True, exist_ok=True)
        (keys / "default").write_text("FAKEKEY\n", encoding="utf-8")

    def helper_in(self, cwd: Path, *args: str):
        """`bash -c "cd '<cwd>' && bash '<helper>' <args>"` as in the original."""
        quoted = " ".join(shlex.quote(a) for a in args)
        script = f"cd {shlex.quote(str(cwd))} && bash {shlex.quote(str(self.helper))} {quoted}"
        return self._run_cmd(["bash", "-c", script], env=self.env, timeout=300)


@pytest.fixture
def sandbox(repo_root, run_cmd, tmp_path):
    return Sandbox(repo_root, run_cmd, tmp_path)


def _setup_empty_filter_repo(sb: Sandbox) -> Path:
    """Repo with real git-crypt magic in HEAD blob and EMPTY filter strings in shared config."""
    broken = sb.tmp / "broken"
    (broken / "environments" / ".secrets").mkdir(parents=True)
    sb.git("init", "-q", "-b", "main", str(broken)).check()
    sb.git("-C", str(broken), "config", "user.email", "t@example.com").check()
    sb.git("-C", str(broken), "config", "user.name", "Tester").check()
    (broken / ".gitattributes").write_text(
        "environments/.secrets/** filter=git-crypt diff=git-crypt\n", encoding="utf-8"
    )
    (broken / "environments" / ".secrets" / "test.yaml").write_bytes(GITCRYPT_BLOB)
    sb.git("-C", str(broken), "add", "-A").check()
    sb.git("-C", str(broken), "commit", "-qm", "init").check()
    sb.install_key(broken)
    # THE DEFECT: empty filters in the shared config.
    sb.git("-C", str(broken), "config", "filter.git-crypt.smudge", "").check()
    sb.git("-C", str(broken), "config", "filter.git-crypt.clean", "").check()
    sb.git("-C", str(broken), "config", "filter.git-crypt.required", "false").check()
    return broken


# ── The bug reproduces with plain git (proves the simulation is faithful) ──


def test_plain_git_worktree_add_fails_on_the_git_crypt_smudge_filter(sandbox):
    wt = sandbox.tmp / "wt-bare"
    result = sandbox.git("-C", str(sandbox.main), "worktree", "add", "-b", "bare", str(wt), "HEAD")
    assert result.returncode != 0
    assert re.search(r"key file", result.output, re.IGNORECASE)
    assert not (wt / "secret" / "data.yaml").exists()


# ── RED: the helper does not exist yet ──────────────────────────────


def test_helper_script_exists_and_is_executable(sandbox):
    assert sandbox.helper.is_file()
    assert os.access(sandbox.helper, os.X_OK)


# ── RED: unlocked repo → usable worktree with DECRYPTED secrets ──────


def test_helper_creates_a_usable_worktree_unlocked_decrypted_secrets(sandbox):
    wt = sandbox.tmp / "wt-ok"
    result = sandbox.helper_in(sandbox.main, "feature/x", str(wt), "HEAD")
    assert result.returncode == 0
    # the worktree exists and the secret is present + decrypted
    assert (wt / "secret" / "data.yaml").is_file()
    assert "TOPSECRET-VALUE" in (wt / "secret" / "data.yaml").read_text(encoding="utf-8")
    # the branch was created
    head = sandbox.git("-C", str(wt), "rev-parse", "--abbrev-ref", "HEAD")
    assert "feature/x" in head.stdout


def test_follow_up_git_commands_in_the_new_worktree_do_not_hit_git_crypt(sandbox):
    wt = sandbox.tmp / "wt-y"
    # Result ignored, as in the original (`|| true`).
    sandbox.helper_in(sandbox.main, "feature/y", str(wt), "HEAD")
    result = sandbox.git("-C", str(wt), "status", "--porcelain")
    assert result.returncode == 0


# ── T001977: unlocked worktree keeps REAL clean filter (encrypts on commit) ───


def test_t001977_unlocked_worktree_keeps_real_clean_smudge_filters_and_required_true(sandbox):
    wt = sandbox.tmp / "wt-f1"
    result = sandbox.helper_in(sandbox.main, "fix/friction1", str(wt), "HEAD")
    assert result.returncode == 0

    # clean has NO worktree-local override — the real (shared) filter applies.
    clean = sandbox.git("-C", str(wt), "config", "--worktree", "filter.git-crypt.clean")
    assert clean.returncode != 0
    # required is true so a broken filter blocks the commit instead of committing plaintext.
    required = sandbox.git("-C", str(wt), "config", "--worktree", "filter.git-crypt.required")
    assert required.returncode == 0
    assert required.output == "true"
    # smudge has no worktree-local override either.
    smudge = sandbox.git("-C", str(wt), "config", "--worktree", "filter.git-crypt.smudge")
    assert smudge.returncode != 0


def test_t001977_git_commit_of_a_managed_file_succeeds_in_unlocked_worktree_clean_has_key(sandbox):
    wt = sandbox.tmp / "wt-f1c"
    result = sandbox.helper_in(sandbox.main, "fix/f1c", str(wt), "HEAD")
    assert result.returncode == 0
    # Modify a git-crypt-managed file and commit — must not fail on the clean filter.
    with (wt / "secret" / "data.yaml").open("a", encoding="utf-8") as handle:
        handle.write("modified\n")
    commit = sandbox.git("-C", str(wt), "commit", "-am", "test: modify git-crypt-managed file")
    assert commit.returncode == 0


# ── RED: locked repo (no key) → still a usable worktree, keyless ─────


def test_helper_works_when_the_repo_is_locked_no_key_via_filter_neutralization(sandbox):
    (sandbox.main / ".git" / "git-crypt" / "keys" / "default").unlink()  # simulate a locked repo
    wt = sandbox.tmp / "wt-z"
    result = sandbox.helper_in(sandbox.main, "fix/z", str(wt), "HEAD")
    assert result.returncode == 0
    assert wt.is_dir()
    # follow-up git ops must still succeed without a key
    status = sandbox.git("-C", str(wt), "status", "--porcelain")
    assert status.returncode == 0


# ── node_modules provisioning: worktrees share deps with the base checkout ──


def test_t000526_a_fresh_worktree_resolves_node_modules_from_the_base_checkout(sandbox):
    # git worktrees do NOT share node_modules; the helper must make the base's resolvable.
    cheerio = sandbox.main / "node_modules" / "cheerio"
    cheerio.mkdir(parents=True)
    (cheerio / "package.json").write_text('{"name":"cheerio"}\n', encoding="utf-8")
    wt = sandbox.tmp / "wt-nm"
    result = sandbox.helper_in(sandbox.main, "feature/nm", str(wt), "HEAD")
    assert result.returncode == 0
    package = wt / "node_modules" / "cheerio" / "package.json"
    assert package.exists()
    assert "cheerio" in package.read_text(encoding="utf-8")


def test_t000526_node_modules_provisioning_is_skipped_cleanly_when_the_base_has_none(sandbox):
    # No node_modules in the base → the helper must still succeed.
    assert not (sandbox.main / "node_modules").exists()
    wt = sandbox.tmp / "wt-nonm"
    result = sandbox.helper_in(sandbox.main, "feature/nonm", str(wt), "HEAD")
    assert result.returncode == 0
    assert not (wt / "node_modules").exists()


# ── Rollback: a failure AFTER the --no-checkout skeleton must not leave junk ──


def test_t001977_broken_smudge_filter_fails_worktree_creation_loudly_and_rolls_back(sandbox):
    sandbox.install_key(sandbox.main)
    sandbox.git("-C", str(sandbox.main), "config", "filter.git-crypt.smudge", "false").check()
    wt = sandbox.tmp / "wt-smudge"
    result = sandbox.helper_in(sandbox.main, "fix/smudge-broken", str(wt), "HEAD")
    assert result.returncode != 0
    assert not wt.is_dir()


# ── T002114: leere git-crypt-Filter in der GETEILTEN .git/config ──────────────


def test_t002114_leere_filter_in_der_geteilten_config_abbruch_statt_kaputtem_worktree(sandbox):
    broken = _setup_empty_filter_repo(sandbox)
    result = sandbox.helper_in(broken, "fix/empty-filter", str(sandbox.tmp / "wt-broken"), "HEAD")
    assert result.returncode != 0
    assert "immer noch verschluesselt" in result.output


def test_t002114_die_fehlermeldung_nennt_die_geteilte_config_als_ursache(sandbox):
    broken = _setup_empty_filter_repo(sandbox)
    result = sandbox.helper_in(broken, "fix/empty-filter2", str(sandbox.tmp / "wt-broken2"), "HEAD")
    assert result.returncode != 0
    # muss auf die GETEILTE Config zeigen, nicht auf die worktree-lokale
    assert re.search(r"geteilten Config", result.output, re.IGNORECASE)
    assert re.search(r"filter.git-crypt.smudge 'git-crypt smudge'", result.output)


def test_t002114_der_kaputte_worktree_wird_zurueckgerollt_nicht_liegengelassen(sandbox):
    broken = _setup_empty_filter_repo(sandbox)
    wt = sandbox.tmp / "wt-broken3"
    result = sandbox.helper_in(broken, "fix/empty-filter3", str(wt), "HEAD")
    assert result.returncode != 0
    assert not wt.is_dir()


def test_t002114_die_canary_pruefung_laeuft_auch_fuer_neu_angelegte_branches(repo_root):
    helper = repo_root / "scripts" / "worktree-create.sh"
    # Positiv-Anker: fehlt das Skript, waere der Negativtest vakuos.
    assert helper.is_file()
    literal = 'BRANCH_EXISTS" -eq 1 ] && [ -f "$KEY_SRC'
    matches = [
        number
        for number, line in enumerate(helper.read_text(encoding="utf-8").splitlines(), start=1)
        if literal in line
    ]
    assert matches == []
