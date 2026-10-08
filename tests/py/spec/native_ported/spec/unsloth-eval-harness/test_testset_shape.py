"""Native migration of tests/spec/unsloth-eval-harness/testset-shape.bats."""
# Pruefmodus: Output-Verifikation (Command output/Exit-Code) of eval_scoring.py validate-testset.

import os
import subprocess
import sys

import pytest

ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}


@pytest.fixture
def scorer(repo_root):
    return repo_root / "scripts/finetune/eval_scoring.py"


@pytest.fixture
def testset(repo_root):
    return repo_root / "scripts/finetune/testsets/agent-actions.jsonl"


def _validate(scorer, path):
    proc = subprocess.run(
        [sys.executable, str(scorer), "validate-testset", str(path)],
        capture_output=True, text=True, env=ENV, timeout=120,
    )
    return proc.returncode, proc.stdout + (("\n" + proc.stderr) if proc.stderr else "")


def test_shipped_testset_has_at_least_40_cases_across_all_three_partitions_and_full_language_pairing(scorer, testset):
    status, out = _validate(scorer, testset)
    assert status == 0, out
    assert "OK:" in out

    text = testset.read_text(encoding="utf-8")
    assert len(text.splitlines()) >= 40

    for cls in ["action", "no_action", "clarify"]:
        assert text.count(f'"class": "{cls}"') > 0, cls


def test_artificially_truncated_testset_fails_validation_with_exit_ungleich_0(scorer, testset, tmp_path):
    short = tmp_path / "short.jsonl"
    lines = testset.read_text(encoding="utf-8").splitlines(keepends=True)[:10]
    short.write_text("".join(lines), encoding="utf-8")

    status, out = _validate(scorer, short)
    assert status != 0
    assert "needs at least 40" in out


def test_testset_missing_a_language_pair_fails_validation_with_exit_ungleich_0(scorer, testset, tmp_path):
    broken = tmp_path / "broken.jsonl"
    kept = [line for line in testset.read_text(encoding="utf-8").splitlines(keepends=True)
            if '"language": "de"' not in line]
    broken.write_text("".join(kept), encoding="utf-8")

    status, out = _validate(scorer, broken)
    assert status != 0
    assert "missing language" in out
