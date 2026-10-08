"""Native migration of tests/spec/dev-flow-plan/plan-lint-rules.bats."""
import pytest


@pytest.fixture
def lint(repo_root):
    return repo_root / "scripts" / "plan-lint.sh"


def test_rules_exits_0_and_prints_non_empty_output(run_cmd, lint):
    result = run_cmd(["bash", str(lint), "--rules"])
    assert result.returncode == 0
    assert result.output != ""


def test_rules_names_every_hard_rule_id(run_cmd, lint):
    # T002716: format-free check, every ID as a plain substring.
    # R1/R2 removed (T900948).
    result = run_cmd(["bash", str(lint), "--rules"])
    for rule_id in ["F1", "F2", "STRUCT1", "STRUCT2", "STRUCT3", "STRUCT-PARTIAL",
                    "D1", "D2", "I1", "P1", "P2", "B1a", "B1b", "T002453-C"]:
        assert rule_id in result.output, f"missing rule id {rule_id}"


def test_rules_needs_no_plan_file_and_no_baseline_json(run_cmd, lint, tmp_path):
    result = run_cmd(["bash", str(lint), "--rules"], cwd=tmp_path)
    assert result.returncode == 0
    assert result.output != ""
