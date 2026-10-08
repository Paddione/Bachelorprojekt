"""Native migration of tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def repo(repo_root: Path) -> Path:
    return repo_root


def test_t001269_dev_flow_execute_skill_does_not_use_old_status_active_sed_replacement(repo):
    skill = repo / ".claude" / "skills" / "dev-flow-execute" / "SKILL.md"
    assert skill.is_file()
    text = skill.read_text(encoding="utf-8")
    old = "sed -i 's/^status: active$/status: completed/'"
    assert old not in text, "old status: active sed replacement still present"


def test_t001269_finalizer_converts_all_active_plan_states_before_database_archive(repo):
    finalizer = repo / "scripts" / "devflow-post-merge-finalize.sh"
    helper = repo / "scripts" / "lib" / "finalize-frontmatter.sh"
    assert finalizer.is_file()
    assert helper.is_file()
    assert "_PLAN_STATUS_ACTIVE_ALT='(active|plan_staged|in_progress|planning)'" in finalizer.read_text(encoding="utf-8")
    assert '_apply_plan_frontmatter_completed_path "$_plan_copy"' in finalizer.read_text(encoding="utf-8")
    assert "status: completed" in helper.read_text(encoding="utf-8")


def test_t001269_contributing_warns_about_git_reset_hard_and_data_loss(repo):
    doc = repo / "CONTRIBUTING.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    assert re.search(r"git reset --hard", text, re.IGNORECASE)
    assert re.search(r"git stash push -u", text, re.IGNORECASE)


def test_t001269_contributing_documents_mcp_extensions_and_tool_registration(repo):
    doc = repo / "CONTRIBUTING.md"
    assert doc.is_file()
    assert re.search(r"MCP-Erweiterung", doc.read_text(encoding="utf-8"), re.IGNORECASE)


def test_t002284_dev_flow_execute_auftrag_block_forbids_implementer_from_spawning_subagents(repo):
    handoff = repo / ".claude" / "skills" / "dev-flow-execute" / "references" / "implementer-handoff.md"
    if not handoff.is_file():
        handoff = repo / ".agents" / "skills" / "dev-flow-execute" / "references" / "implementer-handoff.md"
    if handoff.is_file():
        source = handoff
    else:
        source = repo / ".claude" / "skills" / "dev-flow-execute" / "SKILL.md"
    assert "Spawne selbst KEINE Subagenten" in source.read_text(encoding="utf-8")
