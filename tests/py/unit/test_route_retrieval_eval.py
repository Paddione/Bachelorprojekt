"""Regression checks for the frozen route retrieval benchmark."""

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[3] / "scripts/route-retrieval-eval.py"
SPEC = importlib.util.spec_from_file_location("route_retrieval_eval", SCRIPT)
eval_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(eval_module)


def test_frozen_snapshot_keeps_inline_routes(repo_root):
    snapshot = eval_module.load_snapshot(repo_root)
    assert len(snapshot["queries"]) == 349
    assert len(snapshot["documents"]) == 119
    assert all(relevant <= snapshot["documents"].keys() for relevant in snapshot["qrels"].values())
    inline = [qid for qid, route in snapshot["route_paths"].items() if route in snapshot["qrels"][qid]]
    assert len(inline) == 4


def test_rank_metrics_perfect_and_missed():
    qrels = {"q": {"a"}}
    assert eval_module.rank_metrics({"q": ["a", "b"]}, qrels) == {
        "ndcg@10": 1.0, "recall@10": 1.0, "mrr@10": 1.0
    }
    assert eval_module.rank_metrics({"q": ["b"]}, qrels) == {
        "ndcg@10": 0.0, "recall@10": 0.0, "mrr@10": 0.0
    }


def test_import_resolution_and_lexical_ranking():
    source = "components/website/src/pages/api/items.ts"
    tracked = {"components/website/src/lib/items/handle.ts", "components/website/src/pages/api/local.ts"}
    assert eval_module.resolve_import(source, "$lib/items/handle", tracked) == "components/website/src/lib/items/handle.ts"
    assert eval_module.resolve_import(source, "./local", tracked) == "components/website/src/pages/api/local.ts"
    ranking = eval_module.lexical_rankings({"q": "invoice payment stripe"}, {"a": "invoice payment stripe", "b": "weather forecast"})
    assert ranking["q"][0] == "a"
