"""Native migration of tests/spec/cbm-eval.bats."""
# The metric and ablation checks import scripts/mcp/cbm-eval.py in-process
# (the BATS version ran the same asserts through `python3 -c`). The CLI checks
# run the script as a subprocess.
import importlib.util
import json
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def m(repo_root):
    spec = importlib.util.spec_from_file_location(
        "mod_under_test", repo_root / "scripts" / "mcp" / "cbm-eval.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def eval_dir(tmp_path) -> Path:
    test_dir = tmp_path / "cbmeval"
    test_dir.mkdir()
    return test_dir


def test_recall_k_mrr_k_math_on_a_5_toy_doc_fixture_with_known_ranking(m):
    # ranked: [a, X, b, Y, c]; expected {a, b, c} (k=10)
    r = m.score_ranking(["a", "b", "c"], ["a", "X", "b", "Y", "c"], k=10)
    assert r["recall@10"] == 1.0, r
    assert abs(r["mrr@10"] - 1.0) < 1e-9, r  # first hit at rank 1
    # expected {b, c}: both present; first ranked hit (b) at rank 3 gives RR 1/3
    r2 = m.score_ranking(["b", "c"], ["a", "X", "b", "Y", "c"], k=10)
    assert r2["recall@10"] == 1.0, r2
    assert abs(r2["mrr@10"] - 1.0 / 3) < 1e-9, r2
    # no hit in top-k -> 0/0
    r3 = m.score_ranking(["zzz"], ["a", "X", "b"], k=2)
    assert r3["recall@2"] == 0.0 and r3["mrr@2"] == 0.0, r3
    # k truncation: hit at rank 3 with k=2 -> miss
    r4 = m.score_ranking(["b"], ["a", "X", "b"], k=2)
    assert r4["recall@2"] == 0.0 and r4["mrr@2"] == 0.0, r4
    # partial recall: 1 of 2 expected in top-k
    r5 = m.score_ranking(["a", "zzz"], ["a", "X"], k=2)
    assert r5["recall@2"] == 0.5, r5
    assert abs(r5["mrr@2"] - 1.0) < 1e-9, r5


def test_normalize_path_strips_store_keys_but_leaves_plain_paths_alone(m):
    assert m.normalize_path("components/website/src/lib/auth.ts") == "components/website/src/lib/auth.ts"
    assert m.normalize_path("repo@8fed539:components/website/src/lib/auth.ts:GET") == "components/website/src/lib/auth.ts"
    assert m.normalize_path("repo@c:lib/a.ts:exchangeCode") == "lib/a.ts"
    # extract_paths accepts path/key/file fields and bare strings
    got = m.extract_paths([{"key": "repo@c:lib/a.ts:GET"}, {"path": "docs/x.md"}, "plain/y.ts"])
    assert got == ["lib/a.ts", "docs/x.md", "plain/y.ts"], got


def test_ablation_delta_boost_minus_fused_inconclusive_when_a_side_is_missing(m):
    def ok(recall, mrr):
        return {"status": "ok", "recall": recall, "mrr": mrr, "n": 5, "by_kind": {}}

    ab = m.ablation_delta({"+graph-boost": ok(0.8, 0.6), "fused": ok(0.7, 0.5)})
    assert abs(ab["delta_mrr"] - 0.1) < 1e-9, ab
    assert abs(ab["delta_recall"] - 0.1) < 1e-9, ab
    assert ab["baseline"] == "fused" and "HELPS" in ab["verdict"], ab
    # missing boosted side -> no fabricated zero
    ab2 = m.ablation_delta({"fused": ok(0.7, 0.5)})
    assert ab2["delta_mrr"] is None and ab2["delta_recall"] is None, ab2
    assert "INCONCLUSIVE" in ab2["verdict"], ab2
    # neutral band
    ab3 = m.ablation_delta({"+graph-boost": ok(0.7, 0.505), "fused": ok(0.7, 0.5)})
    assert "NEUTRAL" in ab3["verdict"], ab3


def test_evaluate_aggregates_per_stage_means_and_marks_unscored_stages_skipped(m):
    rows = [
        {"id": "q1", "kind": "code", "expected_paths": ["a"]},
        {"id": "q2", "kind": "doc", "expected_paths": ["b"]},
    ]
    ranked = {
        "q1": {"fused": ["a", "x"], "+graph-boost": ["x", "a"]},
        "q2": {"fused": ["y", "b"]},  # no graph-boost ranking for q2
    }
    rep = m.evaluate(ranked, rows, ["fused", "+graph-boost", "dense-only"], k=10)
    fused = rep["stages"]["fused"]
    assert fused["status"] == "ok" and fused["n"] == 2, fused
    assert abs(fused["recall"] - 1.0) < 1e-9, fused
    assert abs(fused["mrr"] - (1.0 + 0.5) / 2) < 1e-9, fused
    gb = rep["stages"]["+graph-boost"]
    assert gb["status"] == "ok" and gb["n"] == 1, gb
    assert abs(gb["mrr"] - 0.5) < 1e-9, gb
    sk = rep["stages"]["dense-only"]
    assert sk["status"] == "SKIPPED" and sk["recall"] is None, sk
    assert rep["ablation"]["delta_mrr"] is not None  # both sides have >=1 score


def test_cli_replays_results_fixtures_and_emits_markdown_json(run_cmd, repo_root, eval_dir):
    eval_path = eval_dir / "eval.jsonl"
    eval_path.write_text(
        '{"id":"q1","query":"auth session","kind":"code","expected_paths":["lib/auth.ts"],"notes":"t"}\n'
        '{"id":"q2","query":"invoice hash","kind":"code","expected_paths":["lib/invoice-hash.ts"],"notes":"t"}\n'
    )
    results_path = eval_dir / "results.json"
    results_path.write_text(
        '{"q1":{"fused":["lib/auth.ts","x"],"dense-only":["x","lib/auth.ts"]},'
        '"q2":{"fused":["y","lib/invoice-hash.ts"],"dense-only":["lib/invoice-hash.ts"]}}'
    )
    json_path = eval_dir / "report.json"
    md_path = eval_dir / "report.md"
    result = run_cmd(
        [
            "python3", str(repo_root / "scripts" / "mcp" / "cbm-eval.py"), "run",
            "--eval", str(eval_path),
            "--results", str(results_path),
            "--stages", "fused,dense-only",
            "--json", str(json_path), "--md", str(md_path),
        ],
    )
    result.check()
    markdown = md_path.read_text()
    assert "| fused | 1.000 | 0.750 |" in markdown
    assert "Ablation" in markdown
    rep = json.loads(json_path.read_text())
    assert rep["stages"]["fused"]["mrr"] == 0.75, rep
    assert rep["stages"]["dense-only"]["mrr"] == 0.75, rep
    assert rep["n_queries"] == 2


def test_cli_fails_closed_when_the_ranker_command_is_missing_no_silent_zeros(run_cmd, repo_root, eval_dir):
    eval_path = eval_dir / "eval.jsonl"
    eval_path.write_text(
        '{"id":"q1","query":"auth session","kind":"code","expected_paths":["lib/auth.ts"],"notes":"t"}\n'
    )
    result = run_cmd(
        [
            "python3", str(repo_root / "scripts" / "mcp" / "cbm-eval.py"), "run",
            "--eval", str(eval_path),
            "--ranker-cmd", "/nonexistent/ranker-cmd --stage foo",
            "--stages", "fused",
        ],
    )
    assert result.returncode != 0
    assert "| fused | 0.000" not in result.output


def test_cli_rejects_eval_rows_with_empty_expected_sets(run_cmd, repo_root, eval_dir):
    eval_path = eval_dir / "bad.jsonl"
    eval_path.write_text(
        '{"id":"q1","query":"vague","kind":"doc","expected_paths":[],"notes":"t"}\n'
    )
    results_path = eval_dir / "r.json"
    results_path.write_text('{"q1":{"fused":["a"]}}')
    result = run_cmd(
        [
            "python3", str(repo_root / "scripts" / "mcp" / "cbm-eval.py"), "run",
            "--eval", str(eval_path),
            "--results", str(results_path),
        ],
    )
    assert result.returncode != 0
