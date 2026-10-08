"""Native migration of tests/spec/unsloth-eval-harness/worker-testset.bats."""
import json
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path) -> dict:
    base = repo_root / "scripts" / "finetune"
    return {
        "scorer": base / "eval_scoring.py",
        "worker_set": base / "testsets" / "instruct-worker.jsonl",
        "legacy_set": base / "testsets" / "agent-actions.jsonl",
    }


def test_worker_testset_validates_at_least_40_action_only_cases_with_full_en_de_pairing(run_cmd, paths):
    result = run_cmd(["python3", str(paths["scorer"]), "validate-testset", str(paths["worker_set"])])
    assert result.returncode == 0
    assert "OK:" in result.output

    lines = paths["worker_set"].read_text(encoding="utf-8").splitlines()
    count = len(lines)
    assert count >= 40
    action_count = sum(1 for line in lines if '"class": "action"' in line)
    assert action_count == count


def test_single_partition_worker_set_is_accepted_no_missing_partition_refusal(run_cmd, paths):
    result = run_cmd(["python3", str(paths["scorer"]), "validate-testset", str(paths["worker_set"])])
    assert result.returncode == 0
    assert "has no cases" not in result.output


def test_agent_actions_jsonl_still_validates_three_partition_regression_guard(run_cmd, paths):
    result = run_cmd(["python3", str(paths["scorer"]), "validate-testset", str(paths["legacy_set"])])
    assert result.returncode == 0
    assert "OK:" in result.output


def test_multi_action_worker_case_scores_full_points_with_complete_set(run_cmd, paths, tmp_path):
    cases = [json.loads(line) for line in paths["worker_set"].read_text(encoding="utf-8").splitlines()
             if line.strip()]
    multi_case = next(c for c in cases if len(c["expected_actions"]) > 1)
    multi = tmp_path / "multi.json"
    multi.write_text(json.dumps({"case": multi_case, "actual_actions": multi_case["expected_actions"]}),
                     encoding="utf-8")
    result = run_cmd(f"python3 '{paths['scorer']}' score < '{multi}'", shell=True)
    assert result.returncode == 0
    assert '"score": 1.0' in result.output
