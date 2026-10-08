"""Native migration of tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats."""

import pytest


@pytest.fixture
def env_setup(repo_root, tmp_path):
    """BATS setup(): isolated lock dir and a scratch git repo on fix/old-branch."""
    lock = str(repo_root / "scripts" / "agent-lock.sh")
    ald = tmp_path / "ald"
    ald.mkdir()
    tr = tmp_path / "tr"
    tr.mkdir()
    ident = ["-c", "user.email=t@example.invalid", "-c", "user.name=t"]
    git = lambda *a: ["git", "-C", str(tr), *ident, *a]  # noqa: E731
    return {"lock": lock, "ald": ald, "tr": tr, "git": git, "ident": ident}


def _env(ald, sid):
    return {"AGENT_LOCK_DIR": str(ald), "AGENT_LOCK_SID": sid}


def _sh(run_cmd, tr, lock, args, ald, sid):
    cmd = f"cd '{tr}' && bash '{lock}' {args}"
    return run_cmd(["bash", "-c", cmd], env=_env(ald, sid))


def _owner(ald):
    import re
    text = (ald / "main-checkout.json").read_text()
    m = re.search(r'"owner_sid": *"([^"]*)"', text)
    return m.group(1) if m else None


def _label(ald):
    import re
    text = (ald / "main-checkout.json").read_text()
    m = re.search(r'"label": *"([^"]*)"', text)
    return m.group(1) if m else None


@pytest.fixture
def repo(run_cmd, env_setup):
    """Initialise TR the way the BATS setup() does."""
    tr, git = env_setup["tr"], env_setup["git"]
    run_cmd(["git", "-C", str(tr), "init", "-q", "-b", "main"]).check()
    run_cmd(git("commit", "-q", "--allow-empty", "-m", "init")).check()
    run_cmd(git("checkout", "-q", "-b", "fix/old-branch")).check()
    run_cmd(git("commit", "-q", "--allow-empty", "-m", "work")).check()
    return env_setup


BOOKKEEPING = "auto: pre-commit self-claim"


def test_t002809_reclaim_main_checkout_lets_a_new_session_take_over_a_bookkeeping_lock_and_the_next_checkout_is_not_reverted(
    run_cmd, repo
):
    tr, ald, lock, git = repo["tr"], repo["ald"], repo["lock"], repo["git"]
    # Session A self-claims (bookkeeping) while HEAD is on fix/old-branch.
    r = _sh(run_cmd, tr, lock, f"claim main-checkout '' --branch fix/old-branch --label '{BOOKKEEPING}'", ald, "session-A")
    assert (ald / "main-checkout.json").is_file(), r.output

    # Session B reclaims before switching away from main.
    r = _sh(run_cmd, tr, lock, "reclaim-main-checkout", ald, "session-B")
    assert r.returncode == 0, f"reclaim-main-checkout failed: {r.output}"
    assert _owner(ald) == "session-B"

    # Session B switches; guard-postcheckout must NOT revert.
    run_cmd(git("checkout", "-q", "-b", "fix/new-branch", "main")).check()
    r = _sh(run_cmd, tr, lock, "guard-postcheckout", ald, "session-B")
    assert r.returncode == 0

    branch = run_cmd(git("rev-parse", "--abbrev-ref", "HEAD")).stdout.strip()
    assert branch == "fix/new-branch", f"HEAD war '{branch}', erwartet 'fix/new-branch'"


def test_t002809_reclaim_main_checkout_refuses_a_deliberate_non_bookkeeping_foreign_claim_leaving_it_unchanged(
    run_cmd, repo
):
    tr, ald, lock = repo["tr"], repo["ald"], repo["lock"]
    # Positiv-Anker: ein Bookkeeping-Lock laesst sich reklamieren.
    _sh(run_cmd, tr, lock, f"claim main-checkout '' --branch fix/old-branch --label '{BOOKKEEPING}'", ald, "session-A")
    r = _sh(run_cmd, tr, lock, "reclaim-main-checkout", ald, "session-B")
    assert r.returncode == 0, f"Positiv-Anker (Bookkeeping-Reclaim) schlug fehl: {r.output}"
    _sh(run_cmd, tr, lock, "release main-checkout ''", ald, "session-B")
    assert not (ald / "main-checkout.json").exists()

    # Deliberate foreign claim with a real label.
    _sh(run_cmd, tr, lock, "claim main-checkout '' --branch fix/old-branch --label dev-flow-chore", ald, "session-C")
    assert (ald / "main-checkout.json").is_file()

    r = _sh(run_cmd, tr, lock, "reclaim-main-checkout", ald, "session-D")
    assert r.returncode == 1, f"reclaim-main-checkout durfte einen deliberaten Fremd-Claim NICHT uebernehmen, output: {r.output}"
    assert _owner(ald) == "session-C"
    assert _label(ald) == "dev-flow-chore"


def test_t002809_reclaim_main_checkout_is_a_no_op_when_no_lock_exists_or_it_is_already_owned_by_the_current_session(
    run_cmd, repo
):
    tr, ald, lock = repo["tr"], repo["ald"], repo["lock"]
    r = _sh(run_cmd, tr, lock, "reclaim-main-checkout", ald, "session-B")
    assert r.returncode == 0, f"reclaim-main-checkout auf freien Lock schlug fehl: {r.output}"
    assert not (ald / "main-checkout.json").exists()

    _sh(run_cmd, tr, lock, f"claim main-checkout '' --branch fix/old-branch --label '{BOOKKEEPING}'", ald, "session-E")
    r = _sh(run_cmd, tr, lock, "reclaim-main-checkout", ald, "session-E")
    assert r.returncode == 0, f"reclaim-main-checkout auf eigenen Lock schlug fehl: {r.output}"
    assert _owner(ald) == "session-E"
