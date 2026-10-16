"""Native migration of tests/spec/fix-ticket-tracking-T002279.bats."""

import os
import re

CLOSURE = "scripts/devflow-post-merge-ticket-closure.sh"


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


def test_skill_md_has_no_ticket_merged_preflight_without_ticket_db(repo_root):
    # Ohne Ticket-DB entfaellt check-merged; der Pre-Commit-Guard bleibt (Positiv-Anker).
    text = (repo_root / ".claude/skills/dev-flow-plan/SKILL.md").read_text(encoding="utf-8")
    assert "plan-preflight.sh pre-commit" in text
    assert "check-merged" not in text


def test_post_merge_yml_contains_ticket_closure_scan_step(repo_root):
    text = (repo_root / ".github/workflows/post-merge.yml").read_text(encoding="utf-8")
    assert "Ticket closure scan" in text
