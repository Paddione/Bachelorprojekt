#!/usr/bin/env python3
"""Deterministic, offline Brain retrieval evaluation (baseline report only)."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

FILTERS = {"type", "tags", "status", "source_kind", "as_of"}
CASE_KEYS = {"id", "query", "relevant_slugs", "top_k", "filters"}


class EvalError(ValueError):
    """Invalid CLI or eval-set data."""


def load_index_module():
    path = Path(__file__).with_name("brain-index.py")
    spec = importlib.util.spec_from_file_location("brain_index", path)
    if spec is None or spec.loader is None:
        raise EvalError("cannot load shared Brain index")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _strings(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not value or any(not isinstance(item, str) or not item for item in value):
        raise EvalError(f"{label} must be a non-empty string list")
    if len(value) != len(set(value)):
        raise EvalError(f"{label} contains duplicates")
    return value


def load_cases(path: Path) -> list[dict[str, Any]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise EvalError(f"cannot read eval set: {path}") from exc
    cases: list[dict[str, Any]] = []
    identifiers: set[str] = set()
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            case = json.loads(line)
        except json.JSONDecodeError as exc:
            raise EvalError(f"line {number}: invalid JSON") from exc
        if not isinstance(case, dict) or set(case) - CASE_KEYS:
            raise EvalError(f"line {number}: unknown or invalid top-level fields")
        identifier, query = case.get("id"), case.get("query")
        if not isinstance(identifier, str) or not identifier or identifier in identifiers:
            raise EvalError(f"line {number}: id must be non-empty and unique")
        if not isinstance(query, str) or not query:
            raise EvalError(f"line {number}: query must be non-empty")
        relevant = _strings(case.get("relevant_slugs"), f"line {number} relevant_slugs")
        top_k = case.get("top_k")
        if top_k is not None and (isinstance(top_k, bool) or not isinstance(top_k, int) or top_k <= 0):
            raise EvalError(f"line {number}: top_k must be positive")
        filters = case.get("filters", {})
        if not isinstance(filters, dict) or set(filters) - FILTERS:
            raise EvalError(f"line {number}: unknown or invalid filter")
        normalized_filters: dict[str, Any] = {}
        for key, value in filters.items():
            if key == "tags":
                normalized_filters[key] = _strings(value, f"line {number} tags")
            elif not isinstance(value, str) or not value:
                raise EvalError(f"line {number}: filter {key} must be a non-empty string")
            else:
                normalized_filters[key] = value
        identifiers.add(identifier)
        cases.append({"id": identifier, "query": query, "relevant_slugs": relevant,
                      "top_k": top_k, "filters": normalized_filters})
    if not cases:
        raise EvalError("eval set is empty")
    return cases


def evaluate(wiki_dir: Path, eval_set: Path, default_k: int) -> dict[str, Any]:
    module = load_index_module()
    index = module.BrainIndex(wiki_dir)
    cases = load_cases(eval_set)
    reports = []
    total_returned = total_stale = total_future = total_unknown = 0
    for case in cases:
        top_k = case["top_k"] or default_k
        filters = case["filters"]
        results = index.search(
            case["query"], top_k=top_k, page_type=filters.get("type"),
            tags=filters.get("tags"), status=filters.get("status"),
            source_kind=filters.get("source_kind"), as_of=filters.get("as_of"),
        )
        returned = [result["slug"] for result in results]
        relevant = set(case["relevant_slugs"])
        recall = len(relevant.intersection(returned)) / len(relevant)
        rank = next((index + 1 for index, slug in enumerate(returned) if slug in relevant), None)
        reciprocal = 0.0 if rank is None else 1.0 / rank
        freshness = [result["freshness"] for result in results]
        stale, future, unknown = (freshness.count(value) for value in ("stale", "future", "unknown"))
        total_returned += len(results)
        total_stale += stale
        total_future += future
        total_unknown += unknown
        reports.append({
            "id": case["id"], "query": case["query"], "top_k": top_k,
            "filters": filters, "relevant_slugs": case["relevant_slugs"],
            "returned_slugs": returned, "recall_at_k": round(recall, 6),
            "reciprocal_rank": round(reciprocal, 6), "returned_results": len(results),
            "stale_results": stale, "future_results": future, "unknown_results": unknown,
        })
    count = len(reports)
    metrics = {
        "recall_at_k": round(sum(item["recall_at_k"] for item in reports) / count, 6),
        "mrr": round(sum(item["reciprocal_rank"] for item in reports) / count, 6),
        "stale_result_rate": round(total_stale / total_returned, 6) if total_returned else 0.0,
        "returned_results": total_returned, "stale_results": total_stale,
        "future_results": total_future, "unknown_results": total_unknown,
    }
    return {"schema_version": 1, "eval_set": str(eval_set), "top_k": default_k,
            "case_count": count, "metrics": metrics, "cases": reports}


def human(report: dict[str, Any]) -> str:
    lines = [f"Brain retrieval eval: {report['eval_set']} cases={report['case_count']} default-k={report['top_k']}"]
    for case in report["cases"]:
        lines.append(f"{case['id']}: Recall@k={case['recall_at_k']:.6f} RR={case['reciprocal_rank']:.6f} returned={case['returned_results']}")
    metrics = report["metrics"]
    lines.append(
        f"Summary: Recall@k={metrics['recall_at_k']:.6f} MRR={metrics['mrr']:.6f} "
        f"stale-result rate={metrics['stale_result_rate']:.6f} returned={metrics['returned_results']} "
        f"stale={metrics['stale_results']} future={metrics['future_results']} unknown={metrics['unknown_results']}"
    )
    return "\n".join(lines)


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wiki-dir", required=True)
    parser.add_argument("--eval-set", required=True)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--format", choices=("human", "json"), default="human")
    args = parser.parse_args(argv)
    try:
        if args.top_k <= 0:
            raise EvalError("top-k must be positive")
        wiki = Path(args.wiki_dir)
        if not wiki.is_dir():
            raise EvalError(f"wiki directory not found: {wiki}")
        report = evaluate(wiki, Path(args.eval_set), args.top_k)
        if args.format == "json":
            print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        else:
            print(human(report))
        return 0
    except (EvalError, OSError, UnicodeError, ValueError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(run())
