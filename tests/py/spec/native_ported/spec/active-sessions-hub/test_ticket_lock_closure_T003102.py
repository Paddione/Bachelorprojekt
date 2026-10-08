"""Native migration of tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats."""

import re
import subprocess

import pytest


@pytest.fixture
def paths(repo_root):
    return {
        "repo": repo_root,
        "ticket_core": str(repo_root / "scripts/vda/ticket/_ticket-core.sh"),
        "update_status": repo_root / "scripts/vda/ticket/update-status.sh",
        "lock_sh": repo_root / "scripts/agent-lock.sh",
        "exec_skill": repo_root / ".opencode/skills/dev-flow-execute/SKILL.md",
        "exec_phases": repo_root / ".claude/skills/references/dev-flow-execute-phases.md",
    }


def _write_foreign_ticket_lock(d, tid, sid="fremde-sid-die-lebt"):
    d.mkdir(parents=True, exist_ok=True)
    (d / f"ticket__{tid}.json").write_text(
        f'{{\n  "owner_sid": "{sid}",\n  "owner_pid": 1,\n  "worktree": "-",\n'
        '  "branch": "fix/foo",\n  "label": "ticket-ops",\n  "tool": "claude"\n}\n'
    )


def _guard(run_cmd, p, args):
    return run_cmd(["bash", "-c", f"cd '{p['repo']}' && source '{p['ticket_core']}' >/dev/null 2>&1; _ticket_lock_guard {args} 2>&1"])


def _section(text, start_re):
    """Lines after the first match of start_re, up to the next ##-## #### heading."""
    out, active = [], False
    for line in text.splitlines():
        if not active:
            if re.search(start_re, line):
                active = True
            continue
        if re.match(r"^#{2,4} ", line):
            break
        out.append(line)
    return "\n".join(out)


def test_closure_modus_fremder_ticket_lock_blockt_den_abschluss_nicht_exit_0_warnung(run_cmd, paths, tmp_path, monkeypatch):
    locks = tmp_path / "locks"
    _write_foreign_ticket_lock(locks, "T009901")
    monkeypatch.setenv("AGENT_LOCK_DIR", str(locks))
    monkeypatch.setenv("CLAUDE_CODE_SESSION_ID", "meine-andere-sid")
    r = _guard(run_cmd, paths, "T009901 closure")
    assert r.returncode == 0
    assert "T003102" in r.output
    assert "release" in r.output


def test_ohne_closure_fremder_ticket_lock_blockt_weiterhin_exit_7_schutz_bleibt(run_cmd, paths, tmp_path, monkeypatch):
    locks = tmp_path / "locks2"
    _write_foreign_ticket_lock(locks, "T009902")
    monkeypatch.setenv("AGENT_LOCK_DIR", str(locks))
    monkeypatch.setenv("CLAUDE_CODE_SESSION_ID", "meine-andere-sid")
    r = _guard(run_cmd, paths, "T009902")
    assert r.returncode == 7
    assert "verweigert" in r.output


def test_eigene_sid_durchgelassen_in_beiden_modi_keine_warnung_kein_block(run_cmd, paths, tmp_path, monkeypatch):
    locks = tmp_path / "locks3"
    _write_foreign_ticket_lock(locks, "T009903", "eigene-sid")
    monkeypatch.setenv("AGENT_LOCK_DIR", str(locks))
    monkeypatch.setenv("CLAUDE_CODE_SESSION_ID", "eigene-sid")
    r = _guard(run_cmd, paths, "T009903 closure")
    assert r.returncode == 0
    assert "T003102" not in r.output, "eigene SID darf keine Warnung ausloesen"


def test_update_status_sh_done_archived_rufen_den_guard_im_closure_modus(paths):
    text = paths["update_status"].read_text(encoding="utf-8")
    assert text.count("_ticket_lock_guard") >= 2
    assert re.search(r'done\|archived\) _ticket_lock_guard "\$id" closure', text)


def test_dev_flow_execute_opencode_minus_1_1_claimt_branch_scoped_kein_check_and_claim_ticket(paths):
    block = _section(paths["exec_skill"].read_text(encoding="utf-8"), r"^### Schritt −1\.1")
    assert block
    assert "claim branch" in block
    assert "check-and-claim ticket" not in block


def test_dev_flow_execute_phases_pre_flight_claimt_branch_scoped_kein_check_and_claim_ticket(paths):
    block = _section(paths["exec_phases"].read_text(encoding="utf-8"), r"^## Schritt −1 bis 0\.5")
    assert block
    assert "claim branch" in block
    assert "check-and-claim ticket" not in block


def test_dev_flow_execute_phases_pre_flight_behandelt_claim_exit_codes_ehem_ticket_preflight_lock_md_t014027(paths):
    block = _section(paths["exec_phases"].read_text(encoding="utf-8"), r"^## Schritt −1 bis 0\.5")
    assert block
    assert "case $RET in" in block
    assert block.count("exit 1") >= 2


def test_claim_verifikation_plus_release_im_dev_flow_execute_sind_branch_scoped(repo_root, paths):
    skill = paths["exec_skill"].read_text(encoding="utf-8")
    assert 'check branch "$(git branch --show-current)"' in skill
    finalize = (repo_root / "scripts/devflow-post-merge-finalize.sh").read_text(encoding="utf-8")
    assert 'release branch "$BRANCH"' in finalize
    assert "devflow-post-merge-finalize.sh" in skill


def test_agent_lock_sh_dokumentiert_ticket_vs_branch_scoped_semantik_mit_t003102(paths):
    text = paths["lock_sh"].read_text(encoding="utf-8")
    assert "T003102" in text
    assert "branch-scoped" in text
    assert "ticket-scoped" in text
