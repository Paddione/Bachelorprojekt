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
    assert 'finalize_release_owned_claims "$_CLEANUP_ANCHOR" "$BRANCH"' in finalize
    guards = (repo_root / "scripts/lib/finalize-step-guards.sh").read_text(encoding="utf-8")
    assert 'for scope in branch ticket' not in guards
    assert 'release branch "$branch"' in guards
    assert '(.owner_sid | tostring) == $sid' in guards
    assert "devflow-post-merge-finalize.sh" in skill


def test_agent_lock_sh_dokumentiert_ticket_vs_branch_scoped_semantik_mit_t003102(paths):
    text = paths["lock_sh"].read_text(encoding="utf-8")
    assert "T003102" in text
    assert "branch-scoped" in text
    assert "ticket-scoped" in text
