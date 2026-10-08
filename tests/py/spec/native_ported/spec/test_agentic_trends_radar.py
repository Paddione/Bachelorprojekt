"""Native migration of tests/spec/agentic-trends-radar.bats."""
import re

import pytest


@pytest.fixture
def workflow_text(repo_root):
    path = repo_root / ".claude" / "workflows" / "agentic-trends-radar.js"
    assert path.is_file(), f"missing: {path}"
    return path.read_text(encoding="utf-8")


def _has_line(text, pattern):
    """Emulate `grep -q PATTERN` (basic regex, line-based)."""
    rx = re.compile(pattern)
    return any(rx.search(line) for line in text.splitlines())


def test_workflow_file_exists(repo_root):
    assert (repo_root / ".claude" / "workflows" / "agentic-trends-radar.js").is_file()


def test_workflow_file_is_non_empty_javascript(workflow_text):
    assert "export const meta" in workflow_text


def test_exports_meta_object_with_name(workflow_text):
    assert "name: 'agentic-trends-radar'" in workflow_text


def test_meta_contains_description_and_when_to_use(workflow_text):
    assert "description:" in workflow_text
    assert "whenToUse:" in workflow_text


def test_defines_4_phases(workflow_text):
    count = sum(1 for line in workflow_text.splitlines() if "title:" in line)
    assert count >= 4


def test_phases_include_sweep_konsolidieren_bewerten_synthese(workflow_text):
    for word in ["Sweep", "Konsolidieren", "Bewerten", "Synthese"]:
        assert word in workflow_text


def test_defines_5_sweep_angles_in_angles_array(workflow_text):
    count = sum(1 for line in workflow_text.splitlines() if "key:" in line)
    assert count >= 5


def test_angles_include_vendor_research_community_oss_practices(workflow_text):
    for angle in ["vendor", "research", "community", "oss", "practices"]:
        assert f"'{angle}'" in workflow_text


def test_trends_schema_requires_name_summary_sources_momentum(workflow_text):
    for field in ["name", "summary", "sources", "momentum"]:
        assert field in workflow_text


def test_verdict_schema_enum_includes_adopt_trial_hold_skip(workflow_text):
    for value in ["adopt", "trial", "hold", "skip"]:
        assert f"'{value}'" in workflow_text


def test_verdict_schema_requires_borrow_what_effort_risks(workflow_text):
    for field in ["borrow_what", "effort", "risks"]:
        assert field in workflow_text


def test_merged_schema_limits_trends_to_max_items_10(workflow_text):
    assert "maxItems: 10" in workflow_text


def test_our_sdlc_constant_exists(workflow_text):
    assert "OUR_SDLC" in workflow_text


def test_our_sdlc_mentions_plan_and_dev_flow(workflow_text):
    assert "plan" in workflow_text
    assert "dev-flow" in workflow_text


def test_workflow_returns_report_results_dropped(workflow_text):
    assert _has_line(workflow_text, r"return.*report.*results.*dropped")
