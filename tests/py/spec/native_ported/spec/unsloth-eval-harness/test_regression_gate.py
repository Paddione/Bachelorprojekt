"""Native migration of tests/spec/unsloth-eval-harness/regression-gate.bats."""
# Pruefmodus: Output-Verifikation (Command output/Exit-Code). The harness runs without GPU and without
# model weights; model outputs come from fixtures written under tmp_path.

import json
import os
import subprocess
import sys

import pytest

ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}


@pytest.fixture
def ctx(repo_root, tmp_path):
    testset = repo_root / "scripts/finetune/testsets/agent-actions.jsonl"
    cases = [json.loads(line) for line in testset.read_text(encoding="utf-8").splitlines() if line.strip()]

    # Base fixture: leer fuer no_action/clarify, exakte erwartete Aktion fuer jeden action-Fall.
    base = {}
    for case in cases:
        if case["class"] == "action":
            base[case["id"]] = json.dumps(case["expected_actions"])
        else:
            base[case["id"]] = ""
    base_path = tmp_path / "base.json"
    base_path.write_text(json.dumps(base), encoding="utf-8")

    return {
        "harness": repo_root / "scripts/finetune/eval_harness.py",
        "testset": testset,
        "cases": cases,
        "tmp": tmp_path,
        "base": base_path,
    }


def _harness(ctx, *args):
    proc = subprocess.run(
        [sys.executable, str(ctx["harness"]), *args],
        capture_output=True, text=True, env=ENV, timeout=120,
    )
    return proc.returncode, proc.stdout + (("\n" + proc.stderr) if proc.stderr else "")


def test_tuned_model_matching_base_model_exits_0_no_regression(ctx):
    tuned = ctx["tmp"] / "tuned.json"
    tuned.write_text(ctx["base"].read_text(encoding="utf-8"), encoding="utf-8")
    report = ctx["tmp"] / "report.json"

    status, out = _harness(ctx, "--testset", str(ctx["testset"]),
                           "--fixture-base", str(ctx["base"]), "--fixture-tuned", str(tuned),
                           "--output", str(report))
    assert status == 0, out
    assert report.is_file()
    assert '"regressions": []' in report.read_text(encoding="utf-8")


def test_tuned_model_regressing_on_no_action_exits_ungleich_0_and_names_the_partition(ctx):
    tuned_data = json.loads(ctx["base"].read_text(encoding="utf-8"))
    for case in ctx["cases"]:
        if case["class"] == "no_action":
            # Regression: das getunte Modell erfindet eine Aktion, die niemand verlangt hat.
            tuned_data[case["id"]] = json.dumps([{"name": "delete_task", "params": {"task_id": "guessed"}}])
    tuned = ctx["tmp"] / "tuned.json"
    tuned.write_text(json.dumps(tuned_data), encoding="utf-8")
    report = ctx["tmp"] / "report.json"

    status, out = _harness(ctx, "--testset", str(ctx["testset"]),
                           "--fixture-base", str(ctx["base"]), "--fixture-tuned", str(tuned),
                           "--output", str(report))
    assert status != 0
    assert "no_action" in out


def test_testset_below_the_size_floor_aborts_before_any_generation_with_exit_ungleich_0(ctx):
    short = ctx["tmp"] / "short.jsonl"
    lines = ctx["testset"].read_text(encoding="utf-8").splitlines(keepends=True)[:10]
    short.write_text("".join(lines), encoding="utf-8")

    status, out = _harness(ctx, "--testset", str(short),
                           "--fixture-base", str(ctx["base"]), "--fixture-tuned", str(ctx["base"]))
    assert status != 0
    assert "needs at least 40" in out
