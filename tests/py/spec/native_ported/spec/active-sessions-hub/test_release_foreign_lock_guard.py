"""Native migration of tests/spec/active-sessions-hub/release-foreign-lock-guard.bats."""

import re

import pytest


@pytest.fixture
def lock_env(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated AGENT_LOCK_DIR."""
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    return {"lock": str(repo_root / "scripts" / "agent-lock.sh"), "dir": lock_dir}


def _call(run_cmd, env, sid, args, tool="claude", extra=None):
    e = {"AGENT_LOCK_SID": sid, "AGENT_LOCK_TOOL": tool}
    e.update(extra or {})
    return run_cmd(["bash", env["lock"], *args], env=e)


def _claim_as_foreign_live_session(run_cmd, env, ticket):
    return _call(run_cmd, env, "session-A", ["claim", "ticket", ticket, "--label", "foreign-session"])


def _hb(path):
    m = re.search(r'"heartbeat_at": *"([^"]*)"', path.read_text())
    return m.group(1) if m else ""


def test_t002447_release_ohne_force_gibt_einen_fremden_lebenden_lock_nicht_frei(run_cmd, lock_env):
    _call(run_cmd, lock_env, "session-own", ["claim", "ticket", "T002447-own", "--label", "own-session"]).check()
    r = _call(run_cmd, lock_env, "session-own", ["release", "ticket", "T002447-own"])
    assert r.returncode == 0, f"Positiv-Anker gebrochen: {r.output}"
    assert not (lock_env["dir"] / "ticket__T002447-own.json").exists()

    _claim_as_foreign_live_session(run_cmd, lock_env, "T002447-a").check()
    r = _call(run_cmd, lock_env, "session-B", ["release", "ticket", "T002447-a"],
              extra={"AGENT_LOCK_FAKE_ALIVE": "session-A"})
    assert r.returncode == 1, "fremder lebender Lock wurde ohne --force freigegeben"
    assert (lock_env["dir"] / "ticket__T002447-a.json").is_file(), "Lock-Datei wurde entfernt"


def test_t002447_die_verweigerung_nennt_beide_sids_und_den_force_ausweg(run_cmd, lock_env):
    _claim_as_foreign_live_session(run_cmd, lock_env, "T002447-b").check()
    r = _call(run_cmd, lock_env, "session-B", ["release", "ticket", "T002447-b"],
              extra={"AGENT_LOCK_FAKE_ALIVE": "session-A"})
    assert r.returncode == 1
    line = next((l for l in r.output.splitlines() if l.startswith("release:")), "")
    assert line, f"keine 'release:'-Diagnosezeile: {r.output}"
    assert "session-A" in line, f"Owner-SID fehlt: {line}"
    assert "session-B" in line, f"Aufrufer-SID fehlt: {line}"
    assert "--force" in line, f"--force-Hinweis fehlt: {line}"


def test_t002447_force_raeumt_den_fremden_lebenden_lock_ab(run_cmd, lock_env):
    _claim_as_foreign_live_session(run_cmd, lock_env, "T002447-c").check()
    r = _call(run_cmd, lock_env, "session-B", ["release", "ticket", "T002447-c", "--force"],
              extra={"AGENT_LOCK_FAKE_ALIVE": "session-A"})
    assert r.returncode == 0, f"--force muss durchlaufen: {r.output}"
    assert not (lock_env["dir"] / "ticket__T002447-c.json").exists()


def test_t002447_ein_aufgegebener_lock_bleibt_ohne_force_freigebbar(run_cmd, lock_env):
    _claim_as_foreign_live_session(run_cmd, lock_env, "T002447-d").check()
    r = _call(run_cmd, lock_env, "session-B", ["release", "ticket", "T002447-d"],
              extra={"AGENT_LOCK_FAKE_ALIVE": ""})
    assert r.returncode == 0, f"toter Owner: release muss ohne --force gelingen: {r.output}"
    assert not (lock_env["dir"] / "ticket__T002447-d.json").exists()


def test_t002447_refresh_verlaengert_einen_fremden_lebenden_lock_nicht(run_cmd, lock_env):
    _claim_as_foreign_live_session(run_cmd, lock_env, "T002447-e").check()
    lf = lock_env["dir"] / "ticket__T002447-e.json"
    hb_before = _hb(lf)
    assert hb_before, "kein heartbeat_at im Lock"
    r = _call(run_cmd, lock_env, "session-B", ["refresh", "ticket", "T002447-e"],
              extra={"AGENT_LOCK_FAKE_ALIVE": "session-A"})
    assert r.returncode != 0, "refresh eines fremden lebenden Locks muss scheitern"
    assert _hb(lf) == hb_before, "heartbeat wurde fremd verlaengert"


def test_t002447_agent_lock_tool_ueberstimmt_die_ambient_harness_marker(run_cmd, lock_env):
    r = _call(run_cmd, lock_env, "session-A", ["claim", "ticket", "T002447-f", "--label", "tool-override"],
              tool="gemini", extra={"CLAUDECODE": "1", "CLAUDE_CODE_SESSION_ID": "ambient-xyz"})
    r.check()
    text = (lock_env["dir"] / "ticket__T002447-f.json").read_text()
    m = re.search(r'"tool": *"([^"]*)"', text)
    assert m and m.group(1) == "gemini", f"AGENT_LOCK_TOOL wurde ignoriert, tool={m and m.group(1)}"


def test_t002447_das_urteil_ist_identisch_mit_und_ohne_ambient_harness_umgebung(run_cmd, lock_env):
    _claim_as_foreign_live_session(run_cmd, lock_env, "T002447-g").check()
    with_env = _call(run_cmd, lock_env, "session-B", ["release", "ticket", "T002447-g"],
                     extra={"AGENT_LOCK_FAKE_ALIVE": "session-A", "CLAUDECODE": "1",
                            "CLAUDE_CODE_SESSION_ID": "ambient-xyz"}).returncode

    _claim_as_foreign_live_session(run_cmd, lock_env, "T002447-h").check()
    r = run_cmd(["env", "-u", "CLAUDECODE", "-u", "CLAUDE_CODE", "-u", "CLAUDE_CODE_SESSION_ID",
                 "-u", "CLAUDE_SESSION_ID", f"AGENT_LOCK_DIR={lock_env['dir']}",
                 "AGENT_LOCK_SID=session-B", "AGENT_LOCK_TOOL=claude", "AGENT_LOCK_FAKE_ALIVE=session-A",
                 "bash", lock_env["lock"], "release", "ticket", "T002447-h"])
    without_env = r.returncode

    assert with_env == without_env, f"Urteil haengt an der Umgebung: mit={with_env} ohne={without_env}"
    assert with_env == 1, f"beide Laeufe muessen verweigern, waren aber {with_env}"
