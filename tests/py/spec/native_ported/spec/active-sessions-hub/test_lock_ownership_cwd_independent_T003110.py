"""Native migration of tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats."""

import subprocess

import pytest


@pytest.fixture
def ownership(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated lock dir plus a real worktree with a subdirectory."""
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    monkeypatch.setenv("AGENT_LOCK_FETCH_TTL", "99999")
    wt = tmp_path / "wt"
    (wt / "subdir").mkdir(parents=True)
    for args in (["init", "-q"], ["config", "user.email", "t@example.com"],
                 ["config", "user.name", "test"], ["commit", "-q", "--allow-empty", "-m", "init"],
                 ["checkout", "-q", "-b", "fix/demo-T003110"]):
        subprocess.run(["git", "-C", str(wt), *args], check=True)
    return {"lock": str(repo_root / "scripts" / "agent-lock.sh"), "repo": repo_root,
            "dir": lock_dir, "wt": wt, "tmp": tmp_path}


def _claim(run_cmd, o, ticket, sid, wt):
    r = run_cmd(["bash", o["lock"], "claim", "ticket", ticket, "--label", "probe",
                 "--worktree", str(wt), "--branch", "fix/demo-T003110"], env={"AGENT_LOCK_SID": sid})
    r.check()


def _check_at(run_cmd, cwd, o, sid, ticket):
    return run_cmd(["bash", "-c", f"cd '{cwd}' && AGENT_LOCK_SID={sid} bash '{o['lock']}' check ticket {ticket}"])


def test_check_yields_the_same_ownership_verdict_from_a_worktree_subdirectory_as_from_its_root(run_cmd, ownership):
    o = ownership
    _claim(run_cmd, o, "TOWN1", "session-A", o["wt"])
    assert (o["dir"] / "ticket__TOWN1.json").is_file()

    # Positiv-Anker: aus der Worktree-Wurzel erkennt check den Lock als eigenen.
    assert _check_at(run_cmd, o["wt"], o, "session-B", "TOWN1").returncode == 0
    # Die Aussage: gleiche Session, anderes cwd innerhalb desselben Worktrees.
    assert _check_at(run_cmd, o["wt"] / "subdir", o, "session-B", "TOWN1").returncode == 0


def test_check_still_reports_a_foreign_worktrees_lock_as_held(run_cmd, ownership):
    o = ownership
    other = o["tmp"] / "other"
    other.mkdir()
    _claim(run_cmd, o, "TOWN2", "session-A", other)
    assert _check_at(run_cmd, o["wt"], o, "session-B", "TOWN2").returncode == 3


def test_ticket_lock_guard_resolves_its_own_session_id_by_the_specd_order_not_a_private_two_name_list(run_cmd, ownership):
    o = ownership
    other = o["tmp"] / "other2"
    other.mkdir()
    _claim(run_cmd, o, "TOWN3", "oc-1", other)

    # Vorbedingung: aus diesem Kontext ist der Lock fremd.
    r = run_cmd(["env", "-u", "CLAUDE_CODE_SESSION_ID", "-u", "CLAUDE_SESSION_ID", "-u", "OPENCODE_SESSION_ID",
                 "AGENT_LOCK_SID=session-other", "bash", "-c",
                 f"cd '{o['repo']}' && bash '{o['lock']}' check ticket TOWN3"])
    assert r.returncode == 3

    # Positiv-Anker: eine wirklich fremde Session bleibt blockiert.
    guard = f"cd '{o['repo']}' && source scripts/vda/ticket/_ticket-core.sh >/dev/null 2>&1 && _ticket_lock_guard TOWN3"
    r = run_cmd(["env", "-u", "CLAUDE_CODE_SESSION_ID", "-u", "CLAUDE_SESSION_ID", "OPENCODE_SESSION_ID=oc-fremd",
                 "AGENT_LOCK_SID=session-other", "bash", "-c", guard])
    assert r.returncode == 7

    # Die Aussage: der Halter oc-1 ist der Aufrufer selbst, die Rettungsklausel muss greifen.
    r = run_cmd(["env", "-u", "CLAUDE_CODE_SESSION_ID", "-u", "CLAUDE_SESSION_ID", "OPENCODE_SESSION_ID=oc-1",
                 "AGENT_LOCK_SID=session-other", "bash", "-c", guard])
    assert r.returncode == 0


def test_a_refused_ticket_lock_guard_names_the_callers_own_session_id_in_its_diagnostic(run_cmd, ownership):
    o = ownership
    other = o["tmp"] / "other3"
    other.mkdir()
    _claim(run_cmd, o, "TOWN4", "session-A", other)

    r = run_cmd(["env", "-u", "CLAUDE_CODE_SESSION_ID", "-u", "CLAUDE_SESSION_ID", "OPENCODE_SESSION_ID=oc-diag",
                 "AGENT_LOCK_SID=session-B", "bash", "-c",
                 f"cd '{o['repo']}' && source scripts/vda/ticket/_ticket-core.sh >/dev/null 2>&1 && _ticket_lock_guard TOWN4 2>&1"])
    assert r.returncode == 7
    assert "session-A" in r.output
    assert "oc-diag" in r.output
