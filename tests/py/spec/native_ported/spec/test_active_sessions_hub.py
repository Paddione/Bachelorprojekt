"""Native migration of tests/spec/active-sessions-hub.bats."""

import json
import time
from pathlib import Path

import pytest


@pytest.fixture
def lock_env(repo_root, tmp_path, monkeypatch):
    """Mirror the BATS setup(): private AGENT_LOCK_DIR, fixed session id, no AGENT_LOCK_SID."""
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    monkeypatch.delenv("AGENT_LOCK_SID", raising=False)
    monkeypatch.setenv("CLAUDE_SESSION_ID", "claude-t002363-suite")
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    return {"lock": repo_root / "scripts" / "agent-lock.sh", "dir": lock_dir}


def _lock(run_cmd, env, *args, cwd=None):
    return run_cmd(["bash", str(env["lock"]), *args], cwd=cwd)


def _load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_t002363_claim_lehnt_ein_positionales_argument_mit_exit_ungleich_0_ab(run_cmd, lock_env):
    res = _lock(run_cmd, lock_env, "claim", "ticket", "T002363", "dev-flow-plan")
    assert res.returncode != 0


def test_t002363_claim_legt_bei_abgelehntem_argument_keine_lock_datei_an(run_cmd, lock_env):
    _lock(run_cmd, lock_env, "claim", "ticket", "T002363", "dev-flow-plan")
    assert not (lock_env["dir"] / "ticket__T002363.json").exists()


def test_t002363_die_fehlermeldung_nennt_das_abgelehnte_argument(run_cmd, lock_env):
    # Auf die AGENT-LOCK-Zeile einschraenken, der Worktree-Pfad enthaelt sonst Suchbegriffe.
    cmd = (
        f"bash '{lock_env['lock']}' claim ticket T002363 dev-flow-plan 2>&1 "
        "| grep '^AGENT-LOCK:' | grep -c \"dev-flow-plan\""
    )
    res = run_cmd(["bash", "-c", cmd])
    assert res.stdout.strip() != "0"


def test_t002363_check_and_claim_lehnt_ein_positionales_argument_ebenfalls_ab(run_cmd, lock_env):
    res = _lock(run_cmd, lock_env, "check-and-claim", "ticket", "T002363", "dev-flow-execute")
    assert res.returncode != 0
    assert not (lock_env["dir"] / "ticket__T002363.json").exists()


def test_t002363_claim_mit_benannten_flags_schreibt_branch_und_label_in_den_lock(run_cmd, lock_env):
    res = _lock(run_cmd, lock_env, "claim", "ticket", "T002363", "--label", "dev-flow-plan",
                "--branch", "chore/probe-T002363")
    assert res.returncode == 0
    lock_file = lock_env["dir"] / "ticket__T002363.json"
    assert lock_file.exists()
    data = _load_json(lock_file)
    assert data["branch"] == "chore/probe-T002363"
    assert data["label"] == "dev-flow-plan"


def test_t002363_branch_scoped_claim_leitet_branch_weiterhin_aus_der_id_ab_t002267(run_cmd, lock_env):
    # Regressionsschutz (T002267): ohne --branch muss das Feld trotzdem gefuellt sein.
    res = _lock(run_cmd, lock_env, "claim", "branch", "chore/probe-T002363", "--label", "dev-flow-chore")
    assert res.returncode == 0
    data = _load_json(lock_env["dir"] / "branch__chore-probe-T002363.json")
    assert data["branch"] == "chore/probe-T002363"


# ── T002513: Regel 0b (Worktree+Branch-Match) respektiert die Heartbeat-TTL ──

def _write_rule0b_lock(run_cmd, tmp_path, lock_dir, name, mode):
    """Write a lock with dead SID+PID and matching worktree+branch.

    mode: stale | fresh | none (none = legacy format without heartbeat_at).
    Returns the worktree path.
    """
    tmprepo = tmp_path / f"wt-{name}"
    tmprepo.mkdir()
    run_cmd(["git", "init", "-q", "-b", "probe-branch"], cwd=tmprepo).check()
    run_cmd(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t",
             "commit", "-q", "--allow-empty", "-m", "init"], cwd=tmprepo).check()

    now = int(time.time())
    stale = now - 1800 - 60
    data = {
        "scope": "ticket",
        "id": name,
        "owner_sid": "99999999",
        "owner_pid": 999999,
        "label": "probe",
        "branch": "probe-branch",
        "worktree": str(tmprepo),
        "created_at": str(stale),
    }
    if mode in ("stale", "fresh"):
        data["heartbeat_at"] = str(stale if mode == "stale" else now)
    (lock_dir / f"{name}.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    # Fresh marker so the first reap does not trigger a network fetch.
    (lock_dir / ".last-fetch").touch()
    return tmprepo


def _reap(run_cmd, lock_env, wt):
    return run_cmd(
        ["bash", str(lock_env["lock"]), "reap"],
        cwd=wt,
        env={"AGENT_LOCK_DIR": str(lock_env["dir"]), "AGENT_LOCK_TTL": "1800"},
    )


def test_t002513_reap_entfernt_lock_mit_worktree_match_bei_abgelaufenem_heartbeat(run_cmd, lock_env, tmp_path):
    wt = _write_rule0b_lock(run_cmd, tmp_path, lock_env["dir"], "ticket__T002513", "stale")
    _reap(run_cmd, lock_env, wt)
    assert not (lock_env["dir"] / "ticket__T002513.json").exists(), (
        "reap liess Lock mit totem Halter + abgelaufenem Heartbeat stehen (Regel 0b ohne TTL)"
    )


def test_t002513_reap_loggt_heartbeat_ttl_fuer_den_entfernten_lock(run_cmd, lock_env, tmp_path):
    wt = _write_rule0b_lock(run_cmd, tmp_path, lock_env["dir"], "ticket__T002513b", "stale")
    _reap(run_cmd, lock_env, wt)
    log = lock_env["dir"] / ".reap.log"
    text = log.read_text(encoding="utf-8") if log.exists() else ""
    assert "ticket__T002513b heartbeat-ttl" in text, (
        ".reap.log enthaelt keinen heartbeat-ttl-Eintrag fuer T002513b"
    )


def test_t002513_reap_laesst_lock_mit_worktree_match_und_frischem_heartbeat_stehen(run_cmd, lock_env, tmp_path):
    # Gegenprobe: ein frischer Heartbeat schuetzt den Lock weiterhin.
    wt = _write_rule0b_lock(run_cmd, tmp_path, lock_env["dir"], "ticket__T002513c", "fresh")
    _reap(run_cmd, lock_env, wt)
    assert (lock_env["dir"] / "ticket__T002513c.json").exists(), (
        "reap hat Lock mit frischem Heartbeat abgeraeumt (Over-Reap)"
    )


def test_t002513_reap_laesst_altformat_ohne_heartbeat_at_durch_regel_0b_stehen(run_cmd, lock_env, tmp_path):
    wt = _write_rule0b_lock(run_cmd, tmp_path, lock_env["dir"], "ticket__T002513d", "none")
    _reap(run_cmd, lock_env, wt)
    assert (lock_env["dir"] / "ticket__T002513d.json").exists(), (
        "reap hat Altformat-Lock ohne heartbeat_at abgeraeumt"
    )
