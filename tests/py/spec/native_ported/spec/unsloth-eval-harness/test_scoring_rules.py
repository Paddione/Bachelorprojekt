"""Native migration of tests/spec/unsloth-eval-harness/scoring-rules.bats."""
# Pruefmodus: Output-Verifikation. eval_scoring.py is called as CLI with the case JSON on stdin;
# stdout and exit code are checked.

import os
import subprocess
import sys

import pytest

ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}


@pytest.fixture
def scorer(repo_root):
    return repo_root / "scripts/finetune/eval_scoring.py"


def _score(scorer, case, actual):
    """Entspricht: python3 eval_scoring.py score <<EOF {"case": case, "actual_actions": actual} EOF"""
    payload = '{"case": ' + case + ', "actual_actions": ' + actual + '}\n'
    proc = subprocess.run(
        [sys.executable, str(scorer), "score"],
        input=payload, capture_output=True, text=True, env=ENV, timeout=120,
    )
    return proc.returncode, proc.stdout + (("\n" + proc.stderr) if proc.stderr else "")


# --- action class ---

def test_action_case_well_formed_correct_action_scores_full_points(scorer):
    case = ('{"class":"action","action_schemas":{"create_task":{"required":["title","due_date"],'
            '"optional":["priority"]}},"expected_actions":[{"name":"create_task"}]}')
    actual = '[{"name":"create_task","params":{"title":"Report","due_date":"2026-08-10"}}]'
    status, out = _score(scorer, case, actual)
    assert status == 0, out
    assert '"score": 1.0' in out


def test_action_case_missing_required_param_does_not_score_full_points(scorer):
    case = ('{"class":"action","action_schemas":{"create_task":{"required":["title","due_date"],'
            '"optional":["priority"]}},"expected_actions":[{"name":"create_task"}]}')
    actual = '[{"name":"create_task","params":{"title":"Report"}}]'
    status, out = _score(scorer, case, actual)
    assert status == 0, out
    assert '"score": 0.0' in out


def test_action_case_unknown_param_does_not_score_full_points(scorer):
    case = ('{"class":"action","action_schemas":{"create_task":{"required":["title","due_date"],'
            '"optional":[]}},"expected_actions":[{"name":"create_task"}]}')
    actual = '[{"name":"create_task","params":{"title":"Report","due_date":"2026-08-10","made_up":"x"}}]'
    status, out = _score(scorer, case, actual)
    assert status == 0, out
    assert '"score": 0.0' in out


def test_action_case_two_expected_actions_score_full_points_only_with_the_complete_set(scorer):
    case = ('{"class":"action","action_schemas":{"schedule_meeting":{"required":["title","start_time"],'
            '"optional":[]},"send_message":{"required":["recipient","body"],"optional":[]}},'
            '"expected_actions":[{"name":"schedule_meeting"},{"name":"send_message"}]}')
    full = ('[{"name":"schedule_meeting","params":{"title":"Sync","start_time":"14:00"}},'
            '{"name":"send_message","params":{"recipient":"team","body":"invite sent"}}]')
    partial = '[{"name":"schedule_meeting","params":{"title":"Sync","start_time":"14:00"}}]'

    status, out = _score(scorer, case, full)
    assert status == 0, out
    assert '"score": 1.0' in out

    status, out = _score(scorer, case, partial)
    assert status == 0, out
    assert '"score": 0.0' in out


# --- no_action class ---

def test_no_action_case_no_emitted_action_scores_full_points(scorer):
    case = '{"class":"no_action","action_schemas":{},"expected_actions":[]}'
    status, out = _score(scorer, case, "[]")
    assert status == 0, out
    assert '"score": 1.0' in out


def test_no_action_case_an_emitted_action_scores_zero(scorer):
    case = ('{"class":"no_action","action_schemas":{"create_task":{"required":["title"],"optional":[]}},'
            '"expected_actions":[]}')
    actual = '[{"name":"create_task","params":{"title":"unwanted"}}]'
    status, out = _score(scorer, case, actual)
    assert status == 0, out
    assert '"score": 0.0' in out


# --- clarify class ---

def test_clarify_case_no_emitted_action_scores_full_points(scorer):
    case = '{"class":"clarify","action_schemas":{},"expected_actions":[]}'
    status, out = _score(scorer, case, "[]")
    assert status == 0, out
    assert '"score": 1.0' in out


def test_clarify_case_an_invented_action_scores_zero(scorer):
    case = ('{"class":"clarify","action_schemas":{"create_task":{"required":["title","due_date"],'
            '"optional":[]}},"expected_actions":[]}')
    actual = '[{"name":"create_task","params":{"title":"guessed","due_date":"guessed"}}]'
    status, out = _score(scorer, case, actual)
    assert status == 0, out
    assert '"score": 0.0' in out
