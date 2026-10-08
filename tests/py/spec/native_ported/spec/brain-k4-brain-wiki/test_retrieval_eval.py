"""Native migration of tests/spec/brain-k4-brain-wiki/retrieval-eval.bats."""

import json
from pathlib import Path

import pytest

ALPHA = """---
type: decision
tags: [eval, alpha]
status: active
source_kind: plan
observed_at: 2025-01-01
valid_from: 2025-01-01
valid_until: 2030-01-01
---
Alpha banana architecture decision banana.
"""

BETA = """---
type: note
tags: [eval, beta]
status: active
source_kind: runbook
observed_at: 2020-01-01
valid_from: 2020-01-01
valid_until: 2024-01-01
---
Beta banana operations handbook.
"""

GAMMA = """---
type: note
tags: [eval]
status: active
---
Gamma legacy kiwi notes.
"""


@pytest.fixture
def ctx(repo_root: Path, tmp_path: Path):
    wiki = tmp_path / "wiki"
    wiki.mkdir()
    (wiki / "alpha.md").write_text(ALPHA, encoding="utf-8")
    (wiki / "beta.md").write_text(BETA, encoding="utf-8")
    (wiki / "gamma.md").write_text(GAMMA, encoding="utf-8")
    return {
        "root": repo_root,
        "runner": repo_root / "scripts" / "brain-retrieval-eval.py",
        "wiki": wiki,
        "tmp": tmp_path,
        "versioned": repo_root / "tests" / "fixtures" / "brain" / "retrieval-eval.jsonl",
    }


def _runner(run_cmd, ctx, evalset: Path, *extra: str, fmt: str = "json"):
    cmd = ["python3", str(ctx["runner"]), "--wiki-dir", str(ctx["wiki"]),
           "--eval-set", str(evalset), *extra, "--format", fmt]
    return run_cmd(cmd)


def test_reproducible_metrics_use_shared_index_and_remain_baseline_only_offline(run_cmd, ctx):
    evalset = ctx["tmp"] / "eval.jsonl"
    evalset.write_text(
        '{"id":"rank-one","query":"alpha banana","relevant_slugs":["alpha"],"top_k":2,"filters":{"as_of":"2026-08-19"}}\n'
        '{"id":"stale","query":"beta operations","relevant_slugs":["beta"],"top_k":2,"filters":{"as_of":"2026-08-19"}}\n'
        '{"id":"missing","query":"banana","relevant_slugs":["not-returned"],"top_k":2}\n',
        encoding="utf-8",
    )
    res1 = _runner(run_cmd, ctx, evalset, "--top-k", "2")
    assert res1.returncode == 0, res1.output
    res2 = _runner(run_cmd, ctx, evalset, "--top-k", "2")
    assert res2.returncode == 0, res2.output
    assert res1.output == res2.output

    d = json.loads(res1.output)
    assert d["schema_version"] == 1
    assert d["case_count"] == 3
    assert set(d["metrics"]) >= {"recall_at_k", "mrr", "stale_result_rate"}
    assert d["metrics"]["recall_at_k"] == 0.333333
    assert d["metrics"]["mrr"] == 0.333333
    assert d["metrics"]["stale_result_rate"] == 0.333333
    assert len(d["cases"]) == 3
    assert "threshold" not in res1.output

    human1 = _runner(run_cmd, ctx, evalset, fmt="human")
    assert human1.returncode == 0, human1.output
    assert "Recall@k" in human1.output
    assert "stale-result rate" in human1.output
    human2 = _runner(run_cmd, ctx, evalset, fmt="human")
    assert human2.returncode == 0
    assert human2.output == human1.output

    evalset.write_text(
        '{"id":"bad","query":"x","relevant_slugs":[],"filters":{"unknown":"x"}}\n', encoding="utf-8"
    )
    bad = _runner(run_cmd, ctx, evalset)
    assert bad.returncode == 2


def test_aggregate_recall_uses_raw_zero_and_one_third_values_before_output_rounding(run_cmd, ctx):
    evalset = ctx["tmp"] / "fractional.jsonl"
    evalset.write_text(
        '{"id":"one-third","query":"alpha banana","relevant_slugs":["alpha","missing-a","missing-b"],"top_k":1}\n'
        '{"id":"zero","query":"does-not-exist","relevant_slugs":["alpha"],"top_k":1}\n',
        encoding="utf-8",
    )
    res = _runner(run_cmd, ctx, evalset)
    assert res.returncode == 0, res.output
    d = json.loads(res.output)
    assert d["cases"][0]["recall_at_k"] == 0.333333
    assert d["cases"][1]["recall_at_k"] == 0.0
    assert d["metrics"]["recall_at_k"] == 0.166667


def test_versioned_eval_set_runs_deterministically_without_threshold_gating(run_cmd, ctx):
    evalset = ctx["versioned"]
    assert evalset.is_file(), f"missing {evalset}"
    res1 = _runner(run_cmd, ctx, evalset, "--top-k", "5")
    assert res1.returncode == 0, res1.output
    res2 = _runner(run_cmd, ctx, evalset, "--top-k", "5")
    assert res2.returncode == 0
    assert res2.output == res1.output

    d = json.loads(res1.output)
    assert d["schema_version"] == 1
    assert d["case_count"] == 12
    assert d["eval_set"].endswith("tests/fixtures/brain/retrieval-eval.jsonl")
    assert "threshold" not in res1.output

    human = _runner(run_cmd, ctx, evalset, fmt="human")
    assert human.returncode == 0, human.output
    assert "cases=12" in human.output
    assert "threshold" not in human.output


def test_invalid_eval_sets_fail_with_exit_2(run_cmd, ctx):
    bad = ctx["tmp"] / "invalid.jsonl"
    bad.write_text(
        '{"id":"dup","query":"a","relevant_slugs":["alpha"]}\n'
        '{"id":"dup","query":"b","relevant_slugs":["beta"]}\n',
        encoding="utf-8",
    )
    assert _runner(run_cmd, ctx, bad).returncode == 2

    bad.write_text('{"id":"k","query":"a","relevant_slugs":["alpha"],"top_k":0}\n', encoding="utf-8")
    assert _runner(run_cmd, ctx, bad).returncode == 2

    res = run_cmd([
        "python3", str(ctx["runner"]),
        "--wiki-dir", str(ctx["tmp"] / "kein-wiki"),
        "--eval-set", str(ctx["versioned"]),
        "--format", "json",
    ])
    assert res.returncode == 2
