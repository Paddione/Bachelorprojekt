"""Native migration of tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats."""

import os
import re

import pytest


def _awk_section(lines, start, stop):
    """Lines from the first match of `start` up to (excluding) the first `stop` match."""
    out, active = [], False
    for line in lines:
        if not active:
            if re.search(start, line):
                active = True
            continue
        if stop(line):
            break
        out.append(line)
    return "\n".join(out)


@pytest.fixture
def paths(repo_root):
    return {
        "ticket_ops": repo_root / ".claude/skills/references/ticket-ops-procedures.md",
        "plan_skill": repo_root / ".claude/skills/dev-flow-plan/SKILL.md",
        "guard": str(repo_root / "scripts/hooks/worktree-write-guard.sh"),
        "ticket_core": str(repo_root / "scripts/vda/ticket/_ticket-core.sh"),
        "repo": repo_root,
    }


def _step36_block(paths):
    lines = paths["ticket_ops"].read_text(encoding="utf-8").splitlines()
    return _awk_section(
        lines,
        r"^### Step 3\.6",
        lambda l: l.startswith("### ") or l.startswith("## ") or re.match(r"^---\s*$", l),
    )


def _precommit_block(paths):
    lines = paths["plan_skill"].read_text(encoding="utf-8").splitlines()
    out, active = [], False
    for line in lines:
        if re.search("Pre-Commit Guard", line):
            active = True
        if active and line.startswith("### Schritt 6"):
            break
        if active:
            out.append(line)
    return "\n".join(out)


def test_ticket_ops_step_3_6_schreibt_einen_branch_scoped_claim_vor(paths):
    block = _step36_block(paths)
    assert block, "Abschnitt Step 3.6 fehlt"
    assert "agent-lock.sh claim" in block
    assert "claim branch" in block


def test_ticket_ops_step_3_6_schreibt_keinen_ticket_scoped_claim_mehr_vor(paths):
    block = _step36_block(paths)
    assert block
    assert "claim branch" in block
    assert "claim ticket" not in block


def test_ticket_ops_step_3_6_sagt_dem_subagenten_welchen_scope_er_selbst_claimt(paths):
    block = _step36_block(paths)
    assert block
    assert "claim branch" in block
    assert "T003102" in block


def test_dev_flow_plan_pre_commit_guard_akzeptiert_branch_slug_json_und_nennt_t003102(paths):
    block = _precommit_block(paths)
    assert block
    assert "agent-locks/" in block
    assert "branch__" in block
    assert "T003102" in block


def _run_guard_two_claims_same_wt(run_cmd, paths, tmp_path, monkeypatch):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    sid = "sid-eine-session"
    wt = tmp_path / "alpha"
    wt.mkdir()
    for scope in ("branch", "worktree"):
        (lock_dir / f"{scope}__alpha.json").write_text(
            '{\n  "owner_sid": "%s",\n  "owner_pid": %d,\n  "worktree": "%s",\n'
            '  "branch": "fix/alpha",\n  "label": "test"\n}\n' % (sid, os.getpid(), wt)
        )
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    monkeypatch.setenv("CLAUDE_CODE_SESSION_ID", sid)
    payload = '{"tool_input":{"file_path":"%s/README.md"}}' % paths["repo"]
    r = run_cmd(["bash", "-c", f"printf '%s' '{payload}' | bash '{paths['guard']}' 2>&1"])
    return r, wt


def test_worktree_write_guard_listet_einen_doppelt_geclaimten_worktree_nur_einmal_auf(run_cmd, paths, tmp_path, monkeypatch):
    r, wt = _run_guard_two_claims_same_wt(run_cmd, paths, tmp_path, monkeypatch)
    assert r.returncode == 2
    count = r.output.count(str(wt))
    assert count > 0, "Pfad taucht nicht auf, Test misst nichts"
    assert count == 1


def test_worktree_write_guard_benennt_die_herkunft_des_besitzes_sid_auch_andere_subagenten(run_cmd, paths, tmp_path, monkeypatch):
    r, _ = _run_guard_two_claims_same_wt(run_cmd, paths, tmp_path, monkeypatch)
    assert r.returncode == 2
    assert "SID" in r.output
    assert "subagent" in r.output.lower()


def test_ticket_lock_guard_nennt_release_vor_ticket_lock_override(run_cmd, paths, tmp_path, monkeypatch):
    lock_dir = tmp_path / "locks7"
    lock_dir.mkdir()
    (lock_dir / "ticket__T009999.json").write_text(
        '{\n  "owner_sid": "fremde-sid-die-lebt",\n  "owner_pid": 1,\n  "worktree": "-",\n'
        '  "branch": "fix/foo",\n  "label": "ticket-ops",\n  "tool": "claude"\n}\n'
    )
    monkeypatch.setenv("AGENT_LOCK_DIR", str(lock_dir))
    monkeypatch.setenv("CLAUDE_CODE_SESSION_ID", "meine-andere-sid")
    r = run_cmd(
        ["bash", "-c", f"cd '{paths['repo']}' && source '{paths['ticket_core']}' >/dev/null 2>&1; _ticket_lock_guard T009999 2>&1"]
    )
    assert r.returncode == 7
    assert "TICKET_LOCK_OVERRIDE" in r.output
    lines = r.output.splitlines()
    rel = next((i for i, l in enumerate(lines, 1) if "release" in l), None)
    ovr = next((i for i, l in enumerate(lines, 1) if "TICKET_LOCK_OVERRIDE" in l), None)
    assert rel is not None
    assert ovr is not None
    assert rel < ovr
