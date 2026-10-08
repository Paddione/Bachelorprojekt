"""Native migration of tests/spec/unsloth-eval-harness/clarify-question.bats."""
import pytest

SCORE_PROGRAM = """
import json, sys
sys.path.insert(0, "scripts/finetune")
from eval_harness import parse_action_output
from eval_scoring import score_case
case = {"class": sys.argv[1], "action_schemas": {}, "expected_actions": []}
print(json.dumps(score_case(case, parse_action_output(sys.argv[2]))))
"""

QUESTION = "Which meeting should I schedule, and when?"


@pytest.fixture
def ask(run_cmd, repo_root):
    def _ask(case_class: str, raw_text: str):
        return run_cmd(["python3", "-c", SCORE_PROGRAM, case_class, raw_text], cwd=repo_root)
    return _ask


def test_clarify_a_clarifying_question_scores_full_points(ask):
    result = ask("clarify", QUESTION)
    assert result.returncode == 0
    assert '"score": 1.0' in result.output


def test_clarify_an_invented_action_still_scores_zero(ask):
    result = ask("clarify", '[{"name": "create_task", "params": {"title": "guessed"}}]')
    assert result.returncode == 0
    assert '"score": 0.0' in result.output


def test_action_a_question_instead_of_json_still_scores_zero(ask):
    result = ask("action", QUESTION)
    assert result.returncode == 0
    assert '"score": 0.0' in result.output


def test_no_action_a_question_instead_of_silence_still_scores_zero(ask):
    result = ask("no_action", QUESTION)
    assert result.returncode == 0
    assert '"score": 0.0' in result.output
