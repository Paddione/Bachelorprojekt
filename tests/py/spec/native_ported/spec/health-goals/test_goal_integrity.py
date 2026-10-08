"""Native migration of tests/spec/health-goals/goal-integrity.bats."""
import pytest


@pytest.fixture
def goal_paths(repo_root):
    return {
        "check": repo_root / "scripts" / "health-goals-check.sh",
        "goals": repo_root / ".claude" / "lib" / "goals.md",
    }


def _grep(text, needle):
    """Emulate `grep NEEDLE FILE`: all matching lines, newline-joined."""
    return "\n".join(line for line in text.splitlines() if needle in line)


def test_anker_goal_definitions_and_check_script_exist(goal_paths):
    assert goal_paths["goals"].is_file()
    assert goal_paths["check"].is_file()


def test_g_dora01_compares_against_threshold_matching_measurement_window(goal_paths):
    check_text = goal_paths["check"].read_text(encoding="utf-8") if goal_paths["check"].is_file() else ""
    if "G-DORA01" in check_text:
        output = _grep(check_text, "G-DORA01")
        assert " ge 5 " not in output


def test_g_size03_no_longer_measures_a_god_file_that_is_not_one(goal_paths):
    check_text = goal_paths["check"].read_text(encoding="utf-8") if goal_paths["check"].is_file() else ""
    if "G-SIZE03" in check_text:
        output = _grep(check_text, "G-SIZE03")
        assert " le 3000 " not in output


def test_g_spec03_allows_no_41_regressions_anymore(goal_paths):
    output = _grep(goal_paths["check"].read_text(encoding="utf-8"), "G-SPEC03")
    assert " le 41 " not in output


def test_g_cq02_allows_no_280_any_usages_anymore(goal_paths):
    output = _grep(goal_paths["check"].read_text(encoding="utf-8"), "G-CQ02")
    assert " le 280 " not in output


def test_g_cq09_allows_no_10_hardcoded_hostnames_anymore(goal_paths):
    output = _grep(goal_paths["check"].read_text(encoding="utf-8"), "G-CQ09")
    assert " le 10 " not in output


def test_g_rh01_allows_no_30_gate_violations_anymore(goal_paths):
    output = _grep(goal_paths["check"].read_text(encoding="utf-8"), "G-RH01")
    assert " le 30 " not in output
