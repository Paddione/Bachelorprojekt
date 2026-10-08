"""Native migration of tests/spec/dev-flow-plan/red-phase-and-handoff-conventions.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def skill(repo_root) -> Path:
    return repo_root / ".claude" / "skills" / "dev-flow-plan" / "SKILL.md"


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _lines(path: Path) -> list:
    return _text(path).splitlines()


def _first_line_no(path: Path, pattern: str, regex: bool = False):
    """1-based number of the first line matching (grep -n | head -1), or None."""
    for number, line in enumerate(_lines(path), start=1):
        if (re.search(pattern, line) if regex else pattern in line):
            return number
    return None


def _output_lines(path: Path, literal: str) -> str:
    """Matching lines joined, emulating `run grep -F pattern` output."""
    return "\n".join(line for line in _lines(path) if literal in line)


def test_dev_flow_plan_skill_is_readable_and_carries_frontmatter_name(skill):
    assert skill.is_file()
    assert "name: dev-flow-plan" in _text(skill)


def test_t002829_prior_art_search_over_adrs_and_guards_is_documented(skill):
    matched = _output_lines(skill, "T002829")
    assert matched != ""
    # The derivation: search decisions, not only code.
    assert "architekturfrage" in matched.lower()
    # C7a-1b (T900560, fix T900685): the search covers ADRs and guards.
    text = _text(skill)
    assert "docs/adr/" in text
    assert "tests/spec/" in text


def test_t002829_prior_art_search_precedes_path_sections(skill):
    prior = _first_line_no(skill, "T002829")
    feature = _first_line_no(skill, r"^## Feature-Pfad", regex=True)
    fix = _first_line_no(skill, r"^## Fix-Pfad", regex=True)
    assert feature is not None
    assert fix is not None
    assert prior is not None
    assert prior < feature
    assert prior < fix


def test_t002820_availability_guard_for_external_binaries_belongs_to_red_phase(skill):
    assert "T002820" in _text(skill)
    text = _text(skill)
    # [T901392] Der Verfuegbarkeits-Guard ist seit pytest shutil.which + pytest.skip.
    assert "shutil.which" in text
    assert "pytest.skip" in text
    assert ".github/workflows/" in text


def test_t002820_red_phase_convention_sits_in_fix_path_not_handoff(skill):
    guard = _first_line_no(skill, "T002820")
    fix = _first_line_no(skill, r"^## Fix-Pfad", regex=True)
    handoff = _first_line_no(skill, r"^## (Uebergabe|Übergabe) an dev-flow-execute", regex=True)
    assert fix is not None
    assert handoff is not None
    assert guard is not None
    assert guard > fix
    assert guard < handoff


def test_t002816_plan_state_does_not_open_a_finished_looking_pr(skill):
    assert "T002816" in _text(skill)
    text = _text(skill)
    assert "--draft" in text
    assert "[plan-only]" in text


def test_t002816_pr_convention_sits_in_handoff_at_the_end(skill):
    guard = _first_line_no(skill, "T002816")
    handoff = _first_line_no(skill, r"^## (Uebergabe|Übergabe) an dev-flow-execute", regex=True)
    assert handoff is not None
    assert guard is not None
    assert guard > handoff
