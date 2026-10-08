"""Native migration of tests/spec/fix-ticket-tracking-T002279.bats."""

import os
import re

CLOSURE = "scripts/devflow-post-merge-ticket-closure.sh"


def test_ticket_closure_script_exists_and_is_executable(repo_root):
    assert os.access(repo_root / CLOSURE, os.X_OK)


def test_ticket_closure_does_not_auto_close_tickets_no_update_status_status_done(repo_root):
    text = (repo_root / CLOSURE).read_text(encoding="utf-8")
    # grep -n 'update-status.*--status.*done' muss ohne Treffer bleiben (Exit 1).
    hits = [line for line in text.splitlines() if re.search(r"update-status.*--status.*done", line)]
    assert hits == []


def test_ticket_closure_script_parses_correctly_bash_n(run_cmd, repo_root):
    r = run_cmd(["bash", "-n", CLOSURE], cwd=repo_root)
    assert r.returncode == 0, r.output


def test_ticket_closure_exits_0_with_ticket_offline_set_no_db(run_cmd, repo_root):
    r = run_cmd(
        ["bash", "-c", 'TICKET_OFFLINE=1 bash scripts/devflow-post-merge-ticket-closure.sh 2>&1; echo "EXIT:$?"'],
        cwd=repo_root,
    )
    out = r.output
    # Soll ohne DB-Zugriff geordnet enden.
    assert ("Summary" in out) or ("No ticket IDs found" in out) or ("TICKET_OFFLINE" in out), out


def test_ticket_closure_rejects_merge_sha_with_invalid_args(run_cmd, repo_root):
    r = run_cmd(["bash", CLOSURE, "--invalid-flag"], cwd=repo_root)
    assert r.returncode != 0


def test_agent_lock_check_merged_command_exists(run_cmd, repo_root):
    r = run_cmd(["bash", "scripts/agent-lock.sh", "check-merged"], cwd=repo_root)
    assert r.returncode == 2


def test_agent_lock_check_merged_validates_ticket_id_format(run_cmd, repo_root):
    r = run_cmd(["bash", "scripts/agent-lock.sh", "check-merged", "INVALID123"], cwd=repo_root)
    assert r.returncode == 2


def test_agent_lock_check_merged_accepts_valid_t_number_format(run_cmd, repo_root):
    r = run_cmd(["bash", "scripts/agent-lock.sh", "check-merged", "T999999"], cwd=repo_root)
    # Nicht gefunden = Exit 0 (sicher); 2 ohne origin/main.
    assert r.returncode in (0, 2), r.output


def test_devflow_post_merge_deploy_references_ticket_closure_script(repo_root):
    text = (repo_root / "scripts/devflow-post-merge-deploy.sh").read_text(encoding="utf-8")
    assert "devflow-post-merge-ticket-closure" in text


def test_skill_md_contains_preflight_check_for_merged_tickets(repo_root):
    text = (repo_root / ".claude/skills/dev-flow-plan/SKILL.md").read_text(encoding="utf-8")
    assert "Check merged ticket" in text


def test_post_merge_yml_contains_ticket_closure_scan_step(repo_root):
    text = (repo_root / ".github/workflows/post-merge.yml").read_text(encoding="utf-8")
    assert "Ticket closure scan" in text
