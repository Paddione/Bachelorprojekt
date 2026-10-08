"""Native migration of tests/spec/batch-git-worktree-integrity.bats."""

# (Batch T003795)

import json
import shlex
from pathlib import Path

import pytest


@pytest.fixture
def repo(repo_root: Path) -> dict:
    return {
        "root": repo_root,
        "stash_net": repo_root / "scripts" / "git-stash-net.sh",
        "lock": repo_root / "scripts" / "agent-lock.sh",
        "guard": repo_root / "scripts" / "hooks" / "worktree-write-guard.sh",
    }


@pytest.fixture
def run_sh(run_cmd):
    def _sh(command: str, **kw):
        return run_cmd(["bash", "-c", command], **kw)
    return _sh


def _git(run_cmd, fx: Path, *args):
    return run_cmd(["git", "-C", str(fx), *args])


def _init_fx(run_cmd, fx: Path) -> None:
    run_cmd(["git", "init", "-q", "-b", "main", str(fx)]).check(0)
    _git(run_cmd, fx, "config", "user.email", "batch-p2@example.invalid").check(0)
    _git(run_cmd, fx, "config", "user.name", "Batch P2 Test").check(0)
    _git(run_cmd, fx, "config", "commit.gpgsign", "false").check(0)
    (fx / "alpha.txt").write_text("base-inhalt\n", encoding="utf-8")
    (fx / "beta.txt").write_text("base-inhalt\n", encoding="utf-8")
    _git(run_cmd, fx, "add", "-A").check(0)
    _git(run_cmd, fx, "commit", "-qm", "base").check(0)


# ─────────────────────────────────────────────────────────────────────────────
# T003069 — Teil-Pop ist ein BEFUND, kein Erfolg
# ─────────────────────────────────────────────────────────────────────────────

def test_t003069_partial_pop_reports_finding_exit_1_and_keeps_entry_as_safety_net(repo, run_cmd, run_sh, tmp_path):
    fx = tmp_path / "fx069"
    _init_fx(run_cmd, fx)

    (fx / "alpha.txt").write_text("stash-inhalt-alpha\n", encoding="utf-8")
    (fx / "beta.txt").write_text("stash-inhalt-beta\n", encoding="utf-8")
    _git(run_cmd, fx, "stash", "push", "-qm", "T003069 teilpop-fixture").check(0)

    # Positiv-Anker: der Eintrag existiert.
    assert "T003069 teilpop-fixture" in _git(run_cmd, fx, "stash", "list").output

    (fx / "alpha.txt").write_text("base-inhalt-neu\n", encoding="utf-8")
    _git(run_cmd, fx, "add", "alpha.txt").check(0)
    _git(run_cmd, fx, "commit", "-qm", "externer Commit aendert alpha.txt").check(0)

    res = run_sh(
        f"cd {shlex.quote(str(fx))} && bash {shlex.quote(str(repo['stash_net']))} "
        "pop --by-message 'T003069 teilpop-fixture'"
    )
    assert res.returncode == 1, res.output
    assert "BEFUND" in res.output
    assert 'git checkout "stash@{0}" -- <pfad>' in res.output
    assert "T003069 teilpop-fixture" in _git(run_cmd, fx, "stash", "list").output
    assert "stash-inhalt-beta" in (fx / "beta.txt").read_text(encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# T003070 — nachrichtenbasierte Aufloesung statt Index
# ─────────────────────────────────────────────────────────────────────────────

def test_t003070_find_by_ticket_finds_entry_despite_index_shift_to_stash_1(repo, run_cmd, run_sh, tmp_path):
    fx = tmp_path / "fx070a"
    _init_fx(run_cmd, fx)

    (fx / "alpha.txt").write_text("t070-inhalt\n", encoding="utf-8")
    _git(run_cmd, fx, "stash", "push", "-qm", "T003070 safety net").check(0)
    (fx / "beta.txt").write_text("anderer-inhalt\n", encoding="utf-8")
    _git(run_cmd, fx, "stash", "push", "-qm", "anderer-eintrag").check(0)

    res = run_sh(f"cd {shlex.quote(str(fx))} && bash {shlex.quote(str(repo['stash_net']))} find --by-ticket T003070")
    assert res.returncode == 0, res.output
    assert "stash@{1}" in res.output
    assert "T003070 safety net" in res.output
    assert "anderer-eintrag" not in res.output, "Fremder Eintrag darf nicht gelistet werden"


def test_t003070_pop_by_message_drops_the_right_entry_and_keeps_the_foreign_one(repo, run_cmd, run_sh, tmp_path):
    fx = tmp_path / "fx070b"
    _init_fx(run_cmd, fx)

    (fx / "alpha.txt").write_text("t070-inhalt\n", encoding="utf-8")
    _git(run_cmd, fx, "stash", "push", "-qm", "T003070 safety net").check(0)
    (fx / "beta.txt").write_text("anderer-inhalt\n", encoding="utf-8")
    _git(run_cmd, fx, "stash", "push", "-qm", "anderer-eintrag").check(0)

    res = run_sh(f"cd {shlex.quote(str(fx))} && bash {shlex.quote(str(repo['stash_net']))} pop --by-message 'T003070 safety net'")
    assert res.returncode == 0, res.output
    assert "t070-inhalt" in (fx / "alpha.txt").read_text(encoding="utf-8")

    listing = _git(run_cmd, fx, "stash", "list").output
    assert "T003070" not in listing, "T003070-Eintrag muss nach dem Pop entfernt sein"
    assert "anderer-eintrag" in listing


# ─────────────────────────────────────────────────────────────────────────────
# T003105 — merge=ours-Rebase als Freshness-Risiko benannt (Textvertrag)
# ─────────────────────────────────────────────────────────────────────────────

def test_t003105_both_git_workflow_skills_name_merge_ours_and_freshness_check_in_rebase_context(repo):
    for skill in (".claude/skills/git-workflow/SKILL.md", ".opencode/skills/git-workflow/SKILL.md"):
        f = repo["root"] / skill
        assert f.is_file() and f.stat().st_size > 0, f"MISSING skill file: {f}"
        text = f.read_text(encoding="utf-8")
        assert "merge=ours" in text, f"merge=ours fehlt in {f}"
        assert "task freshness:check" in text, f"task freshness:check fehlt in {f}"
        assert "T003105" in text, f"T003105-Referenz fehlt in {f}"


# ─────────────────────────────────────────────────────────────────────────────
# T003131 — worktree-write-guard: OPENCODE_SESSION_ID, Besitz-Quelle, Dedup
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def guard_env(monkeypatch, tmp_path):
    for name in ("CLAUDE_CODE_SESSION_ID", "CLAUDE_SESSION_ID", "AGENT_LOCK_SID"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("OPENCODE_SESSION_ID", "sid-opencode-131")
    lock_dir = tmp_path / "guard-locks"
    lock_dir.mkdir()
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    (lock_dir / ".last-fetch").touch()
    return lock_dir


def _guard_fx(run_cmd, fx: Path) -> None:
    fx.mkdir(parents=True)
    run_cmd(["git", "init", "-q", "-b", "main", str(fx)]).check(0)
    _git(run_cmd, fx, "config", "user.email", "batch-p2@example.invalid").check(0)
    _git(run_cmd, fx, "config", "user.name", "Batch P2 Test").check(0)
    _git(run_cmd, fx, "config", "commit.gpgsign", "false").check(0)
    (fx / "README.md").write_text("inhalt\n", encoding="utf-8")
    _git(run_cmd, fx, "add", "-A").check(0)
    _git(run_cmd, fx, "commit", "-qm", "base").check(0)
    (fx / "wt-alpha").mkdir()


def _guard_input(run_sh, repo, fx: Path, target: str):
    payload = json.dumps({"tool_input": {"file_path": target}})
    return run_sh(
        f"cd {shlex.quote(str(fx))} && printf '%s' {shlex.quote(payload)} | bash {shlex.quote(str(repo['guard']))}"
    )


def test_t003131_guard_accepts_own_claims_via_opencode_session_id_and_names_ownership_source(
        repo, run_cmd, run_sh, guard_env, tmp_path):
    fx = tmp_path / "guard-fx-a"
    _guard_fx(run_cmd, fx)

    res = run_sh(
        f"cd {shlex.quote(str(fx))} && bash {shlex.quote(str(repo['lock']))} claim branch wg-test-131 "
        f"--worktree {shlex.quote(str(fx / 'wt-alpha'))} --label selftest"
    )
    assert res.returncode == 0, res.output
    lock_file = guard_env / "branch__wg-test-131.json"
    assert '"owner_sid": "sid-opencode-131"' in lock_file.read_text(encoding="utf-8")

    # Schreiben in den eigenen Claim ist erlaubt.
    res = _guard_input(run_sh, repo, fx, f"{fx / 'wt-alpha'}/neu.txt")
    assert res.returncode == 0, res.output

    # Ziel ausserhalb des Claims: Regel 2 greift.
    res = _guard_input(run_sh, repo, fx, f"{fx}/README.md")
    assert res.returncode == 2, res.output
    assert "agent-locks" in res.output
    assert "owner_sid" in res.output


def test_t003131_branch_and_worktree_scope_lock_on_same_worktree_listed_exactly_once(
        repo, run_cmd, run_sh, guard_env, tmp_path):
    fx = tmp_path / "guard-fx-b"
    _guard_fx(run_cmd, fx)

    res = run_sh(
        f"cd {shlex.quote(str(fx))} && bash {shlex.quote(str(repo['lock']))} claim branch wg-test-131 "
        f"--worktree {shlex.quote(str(fx / 'wt-alpha'))} --label selftest"
    )
    assert res.returncode == 0, res.output
    res = run_sh(
        f"cd {shlex.quote(str(fx))} && bash {shlex.quote(str(repo['lock']))} claim worktree wg-test-131 "
        f"--worktree {shlex.quote(str(fx / 'wt-alpha'))} --label selftest"
    )
    assert res.returncode == 0, res.output

    res = _guard_input(run_sh, repo, fx, f"{fx}/README.md")
    assert res.returncode == 2, res.output
    count = sum(1 for line in res.output.split("\n") if str(fx / "wt-alpha") in line)
    assert count > 0, "worktree not listed"
    assert count == 1, f"worktree listed {count} times"
