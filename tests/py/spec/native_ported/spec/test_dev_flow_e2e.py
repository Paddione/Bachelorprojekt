"""Native migration of tests/spec/dev-flow-e2e.bats."""

# SSOT: .agents/skills/dev-flow-e2e/SKILL.md
#
# Verification and regression tests for the dev-flow-e2e skill:
# - Agent routing (bachelorprojekt-test)
# - Branch naming constraints (no test/* branches, ticketed chore/* for test-only work)
# - Commit scope conventions (test(test): ... not e2e per T002328)
# - Playwright working directory and setup expectations (tests/e2e/ and SKIP_DB_PURGE=1)
# - Tag annotation requirement for scoped PR runs (@tag)
# - Optional headed verification specification (T002467)
# - Closure handoff to mishap-tracker and operations-management

import re
from pathlib import Path

import pytest


@pytest.fixture
def skill(repo_root: Path) -> Path:
    path = repo_root / ".agents" / "skills" / "dev-flow-e2e" / "SKILL.md"
    assert path.is_file(), f"missing file: {path}"
    return path


def _grep_ok(path: Path, pattern: str, fixed: bool = False) -> None:
    """Assert that at least one line of path matches pattern (grep -n semantics)."""
    for line in path.read_text(encoding="utf-8").splitlines():
        if (pattern in line) if fixed else re.search(pattern, line):
            return
    pytest.fail(f"no line matches {pattern!r} in {path}")


# ── 1. Frontmatter and Agent Routing ──────────────────────────────────────────

# T900858: bachelorprojekt-test ist in bp-ship aufgegangen.
def test_dev_flow_e2e_frontmatter_assigns_bp_ship_agent(skill):
    _grep_ok(skill, r"^agent:[ \t]*bp-ship")


def test_dev_flow_e2e_frontmatter_description_mentions_post_merge_e2e_execution(skill):
    _grep_ok(skill, "AFTER dev-flow-execute has merged and deployed", fixed=True)


# ── 2. Git & Branching Conventions ────────────────────────────────────────────

def test_dev_flow_e2e_documents_test_branches_are_forbidden_by_pre_commit(skill):
    _grep_ok(skill, r"(`test/\*`|test/\*)-Branches sind nicht erlaubt")


def test_dev_flow_e2e_enforces_ticketed_chore_branch_prefix_for_e2e_changes(skill):
    _grep_ok(skill, r"E2E-Branches nutzen.*`chore/`|ticketed.*`chore/`")


def test_dev_flow_e2e_enforces_commit_scope_test_instead_of_deprecated_e2e(skill):
    _grep_ok(skill, "Scope 'test' verwenden — 'e2e' lehnt validate-commit-msg ab", fixed=True)
    _grep_ok(skill, "test(test): add E2E tests for", fixed=True)


# ── 3. Execution Working Directory and Environment Setup ──────────────────────

def test_dev_flow_e2e_specifies_tests_e2e_as_execution_working_directory(skill):
    _grep_ok(skill, "cd tests/e2e/", fixed=True)


def test_dev_flow_e2e_specifies_node_modules_playwright_binary_check(skill):
    _grep_ok(skill, "[[ -x ./node_modules/.bin/playwright ]] || npm ci", fixed=True)


def test_dev_flow_e2e_documents_skip_db_purge_flag_requirement(skill):
    _grep_ok(skill, "SKIP_DB_PURGE=1", fixed=True)


# ── 4. Tag Annotations and Test Description ───────────────────────────────────

def test_dev_flow_e2e_requires_tag_annotation_in_test_describe_block_for_pr_workflow(skill):
    _grep_ok(skill, "PFLICHT: Tag-Annotation für den PR-E2E-Workflow", fixed=True)
    _grep_ok(skill, r"test\.describe.*tag:")


def test_dev_flow_e2e_documents_standard_feature_tags(skill):
    _grep_ok(skill, "@smoke @website @content-hub @admin @factory", fixed=True)


# ── 5. Headed-Verify Specification (T002467) ──────────────────────────────────

def test_dev_flow_e2e_specifies_headed_verify_as_optional_and_non_blocking(skill):
    _grep_ok(skill, "Explizit optional — kein Pflichtschritt, kein CI-Gate", fixed=True)
    _grep_ok(skill, "k8-headed-verify.spec.ts", fixed=True)


def test_dev_flow_e2e_checks_vision_endpoints_on_port_8094_and_fallback_port_8091(skill):
    _grep_ok(skill, "8094", fixed=True)
    _grep_ok(skill, "8091", fixed=True)


# ── 6. Completion Handoff & Framework Support ─────────────────────────────────

def test_dev_flow_e2e_mandates_mishap_tracker_report_at_conclusion(skill):
    _grep_ok(skill, "mishap-tracker", fixed=True)


def test_dev_flow_e2e_mandates_operations_management_transition(skill):
    _grep_ok(skill, "operations-management", fixed=True)


def test_dev_flow_e2e_contains_framework_mapping_section_for_claude_code_opencode_agy(skill):
    _grep_ok(skill, "## Framework mapping", fixed=True)
    _grep_ok(skill, "**Claude Code**", fixed=True)
    _grep_ok(skill, "**opencode**", fixed=True)
    _grep_ok(skill, "**agy**", fixed=True)
