#!/usr/bin/env python3
"""cbm-eval.py — hand-labeled retrieval eval + per-stage ablation for T900993/A6.

Reads docs/brain/k3-retrieval-eval.jsonl, obtains one ranked path list per
(query, stage) through a ranker adapter, and scores Recall@10 + MRR@10 per
stage plus the graph-boost ablation delta (on/off).

Ranker adapters (in priority order):
  1. --results FILE.json — replay precomputed rankings, no backends needed:
     {query_id: {stage: ["path", ...]}}. Used by fixtures, CI, and PENDING
     live runs.
  2. --ranker-cmd CMD — shell out per (query, stage) with env
     CBM_EVAL_STAGE / CBM_EVAL_QUERY / CBM_EVAL_QUERY_ID / CBM_EVAL_K.
     CMD must print JSON {"results": [{"path": ..., "score": ...}, ...]}
     ("key" or "file" accepted in place of "path"; store keys of the form
     repo@commit:path:symbol are normalized to path). Any nonzero exit or
     malformed JSON fails the stage closed (ERROR, exit 2) — never silent 0.
  3. In-process import of cbm-graph-rerank / cbm-hybrid score functions is
     intentionally NOT attempted: metric math must stay independent of the
     rankers under test. (Adapter seam: a future hybrid CLI plugs in via
     --ranker-cmd unchanged.)

Stages: fts-only, dense-only, fused, +cross-encoder, +graph-boost.
A ranker command may decline a stage by exiting 3 -> stage marked SKIPPED.

Stdlib-only. Pure metric layer is spec-tested network-free
(tests/spec/cbm-eval.bats); the CLI is a thin wrapper.

Usage:
    python3 scripts/mcp/cbm-eval.py run --eval docs/brain/k3-retrieval-eval.jsonl \\
        --results /tmp/rankings.json [--k 10] [--json out.json] [--md out.md]
    python3 scripts/mcp/cbm-eval.py run --eval <jsonl> \\
        --ranker-cmd 'python3 scripts/mcp/cbm-hybrid.py rank --stage "$CBM_EVAL_STAGE"'
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

SCHEMA_VERSION = "k3-retrieval-eval/1"
DEFAULT_STAGES = ["fts-only", "dense-only", "fused", "+cross-encoder",
                  "+graph-boost"]
BASELINE_STAGE = "fused"  # ablation delta is measured against this stage
SKIP_EXIT = 3


class EvalError(Exception):
    pass


# ── pure metric layer (no network, no IO) ──────────────────────────────────

def normalize_path(s):
    """Map a ranked hit to a repo-relative path.

    Accepts plain paths and content-hash store keys
    (repo@commit:path:symbol). The trailing :symbol is stripped only when
    the remainder still looks like a path (contains '/').
    """
    if not isinstance(s, str):
        raise EvalError("ranked hit is not a string: %r" % (s,))
    rest = s
    if "@" in s:
        after = s.split("@", 1)[1]
        if ":" not in after:
            raise EvalError("unparseable store key: %r" % (s,))
        rest = after.split(":", 1)[1]
    head, sep, _tail = rest.rpartition(":")
    if sep and "/" in head:
        return head
    return rest


def extract_paths(results):
    """Normalize a ranker 'results' list to [path, ...] in rank order."""
    paths = []
    for item in results:
        if isinstance(item, str):
            paths.append(normalize_path(item))
        elif isinstance(item, dict):
            for field in ("path", "key", "file"):
                if item.get(field):
                    paths.append(normalize_path(item[field]))
                    break
            else:
                raise EvalError("result item has no path/key/file: %r"
                                % (item,))
        else:
            raise EvalError("result item is not an object: %r" % (item,))
    return paths


def recall_at_k(expected, ranked, k=10):
    """Fraction of expected paths present in the top-k ranked paths."""
    if not expected:
        raise EvalError("empty expected set")
    top = set(ranked[:k])
    hits = sum(1 for e in expected if e in top)
    return hits / len(expected)


def reciprocal_rank(expected, ranked, k=10):
    """1/rank of the first expected hit within top-k, else 0.0 (MRR@k)."""
    want = set(expected)
    for i, path in enumerate(ranked[:k], start=1):
        if path in want:
            return 1.0 / i
    return 0.0


def score_ranking(expected, ranked, k=10):
    return {"recall@%d" % k: recall_at_k(expected, ranked, k),
            "mrr@%d" % k: reciprocal_rank(expected, ranked, k)}


def evaluate(ranked_by_qid_stage, rows, stages, k=10):
    """Pure: score precomputed rankings.

    ranked_by_qid_stage: {qid: {stage: [path, ...]}}.
    Returns {"stages": {stage: {recall, mrr, n, status}}, "queries": [...],
    "ablation": {...}}. A stage with no rankings at all is SKIPPED, never 0.
    """
    per_stage = {s: {"recall_sum": 0.0, "mrr_sum": 0.0, "n": 0,
                     "by_kind": {}} for s in stages}
    queries = []
    for row in rows:
        qid = row["id"]
        exp = row["expected_paths"]
        got = ranked_by_qid_stage.get(qid, {})
        qrec = {"id": qid, "kind": row.get("kind", "?"), "stages": {}}
        for stage in stages:
            if stage not in got:
                qrec["stages"][stage] = {"status": "missing"}
                continue
            sc = score_ranking(exp, got[stage], k)
            qrec["stages"][stage] = {"status": "ok",
                                     "recall": sc["recall@%d" % k],
                                     "mrr": sc["mrr@%d" % k]}
            acc = per_stage[stage]
            acc["recall_sum"] += sc["recall@%d" % k]
            acc["mrr_sum"] += sc["mrr@%d" % k]
            acc["n"] += 1
            kind = qrec["kind"]
            kb = acc["by_kind"].setdefault(
                kind, {"recall_sum": 0.0, "mrr_sum": 0.0, "n": 0})
            kb["recall_sum"] += sc["recall@%d" % k]
            kb["mrr_sum"] += sc["mrr@%d" % k]
            kb["n"] += 1
        queries.append(qrec)
    stages_out = {}
    for stage in stages:
        acc = per_stage[stage]
        if acc["n"] == 0:
            stages_out[stage] = {"status": "SKIPPED", "recall": None,
                                 "mrr": None, "n": 0, "by_kind": {}}
            continue
        kinds = {}
        for kind, kb in acc["by_kind"].items():
            kinds[kind] = {"recall": kb["recall_sum"] / kb["n"],
                           "mrr": kb["mrr_sum"] / kb["n"], "n": kb["n"]}
        stages_out[stage] = {"status": "ok",
                             "recall": acc["recall_sum"] / acc["n"],
                             "mrr": acc["mrr_sum"] / acc["n"],
                             "n": acc["n"], "by_kind": kinds}
    ablation = ablation_delta(stages_out)
    return {"stages": stages_out, "queries": queries, "ablation": ablation,
            "k": k, "n_queries": len(rows)}


def ablation_delta(stages_out):
    """Graph-boost delta vs BASELINE_STAGE ('+graph-boost' on/off).

    Returns {"baseline", "delta_recall", "delta_mrr", "verdict"} with None
    deltas when either side is missing — never a fabricated 0.0.
    """
    boosted = stages_out.get("+graph-boost", {})
    base = stages_out.get(BASELINE_STAGE, {})
    if boosted.get("status") != "ok" or base.get("status") != "ok":
        return {"baseline": BASELINE_STAGE, "delta_recall": None,
                "delta_mrr": None,
                "verdict": "INCONCLUSIVE (missing stage)"}
    dr = boosted["recall"] - base["recall"]
    dm = boosted["mrr"] - base["mrr"]
    if dm > 0.01:
        verdict = "graph-boost HELPS (MRR +%.3f)" % dm
    elif dm < -0.01:
        verdict = "graph-boost HURTS (MRR %.3f)" % dm
    else:
        verdict = "graph-boost NEUTRAL (|MRR delta| <= 0.01)"
    return {"baseline": BASELINE_STAGE, "delta_recall": dr, "delta_mrr": dm,
            "verdict": verdict}


# ── IO / adapters ──────────────────────────────────────────────────────────

def load_eval(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise EvalError("%s:%d: invalid JSON: %s" % (path, lineno,
                                                             exc))
            for field in ("id", "query", "kind", "expected_paths"):
                if field not in row:
                    raise EvalError("%s:%d: missing field %r" % (path, lineno,
                                                                field))
            if row["kind"] not in ("code", "doc", "route"):
                raise EvalError("%s:%d: bad kind %r" % (path, lineno,
                                                        row["kind"]))
            if (not isinstance(row["expected_paths"], list)
                    or not row["expected_paths"]):
                raise EvalError("%s:%d: expected_paths must be a non-empty "
                                "list" % (path, lineno))
            rows.append(row)
    if not rows:
        raise EvalError("%s: no queries" % path)
    return rows


def load_results(path):
    with open(path, encoding="utf-8") as fh:
        try:
            data = json.load(fh)
        except json.JSONDecodeError as exc:
            raise EvalError("%s: invalid JSON: %s" % (path, exc))
    if not isinstance(data, dict):
        raise EvalError("%s: top-level must be {query_id: {stage: [...]}}"
                        % path)
    out = {}
    for qid, stages in data.items():
        if not isinstance(stages, dict):
            raise EvalError("%s: entry %r must be {stage: [...]}" % (path,
                                                                     qid))
        out[qid] = {}
        for stage, results in stages.items():
            if isinstance(results, dict) and "results" in results:
                results = results["results"]
            out[qid][stage] = extract_paths(results)
    return out


def rank_via_cmd(cmd, stage, row, k, timeout=120):
    """Run CMD per (query, stage); parse {"results": [...]} from stdout."""
    env = dict(os.environ)
    env["CBM_EVAL_STAGE"] = stage
    env["CBM_EVAL_QUERY"] = row["query"]
    env["CBM_EVAL_QUERY_ID"] = row["id"]
    env["CBM_EVAL_K"] = str(k)
    try:
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                              env=env, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise EvalError("ranker timeout (stage %s, query %s)" % (stage,
                                                                 row["id"]))
    if proc.returncode == SKIP_EXIT:
        return None  # stage declined -> SKIPPED
    if proc.returncode != 0:
        raise EvalError("ranker failed (stage %s, query %s, exit %d): %s"
                        % (stage, row["id"], proc.returncode,
                           proc.stderr.strip()[:500]))
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise EvalError("ranker printed malformed JSON (stage %s, query %s)"
                        % (stage, row["id"]))
    if not isinstance(data, dict) or "results" not in data:
        raise EvalError("ranker JSON needs a 'results' key (stage %s, "
                        "query %s)" % (stage, row["id"]))
    return extract_paths(data["results"])


def collect_rankings(rows, stages, k, ranker_cmd=None, results=None,
                     timeout=120):
    """Gather {qid: {stage: [paths]}} via --results replay or --ranker-cmd."""
    if results is not None and ranker_cmd is not None:
        raise EvalError("pass exactly one of --results / --ranker-cmd")
    if results is not None:
        pre = load_results(results)
        return {row["id"]: pre.get(row["id"], {}) for row in rows}
    if ranker_cmd is None:
        raise EvalError("pass one of --results / --ranker-cmd (no live "
                        "ranker is embedded)")
    out = {}
    for row in rows:
        per_stage = {}
        for stage in stages:
            ranked = rank_via_cmd(ranker_cmd, stage, row, k, timeout)
            if ranked is not None:
                per_stage[stage] = ranked
        out[row["id"]] = per_stage
    return out


# ── report ─────────────────────────────────────────────────────────────────

def markdown_table(report, eval_path):
    k = report["k"]
    lines = []
    lines.append("# K3 retrieval eval (hand-labeled, T900993/A6)")
    lines.append("")
    lines.append("Source: `%s` (%d queries). Metric: Recall@%d + MRR@%d. "
                 "Labels are hand-judged file reads (see eval notes); the "
                 "old import-derived 3-query set is NOT reused."
                 % (eval_path, report["n_queries"], k, k))
    lines.append("")
    lines.append("| stage | Recall@%d | MRR@%d | n | status |" % (k, k))
    lines.append("|---|---|---|---|---|")
    for stage, s in report["stages"].items():
        if s["status"] != "ok":
            lines.append("| %s | — | — | 0 | %s |" % (stage, s["status"]))
        else:
            lines.append("| %s | %.3f | %.3f | %d | ok |"
                         % (stage, s["recall"], s["mrr"], s["n"]))
    lines.append("")
    ab = report["ablation"]
    if ab["delta_mrr"] is None:
        lines.append("Ablation (graph-boost vs %s): PENDING — %s."
                     % (ab["baseline"], ab["verdict"]))
    else:
        lines.append("Ablation (graph-boost vs %s): ΔRecall=%+.3f "
                     "ΔMRR=%+.3f — %s."
                     % (ab["baseline"], ab["delta_recall"], ab["delta_mrr"],
                        ab["verdict"]))
    lines.append("")
    lines.append("Per-kind breakdown:")
    lines.append("")
    lines.append("| stage | kind | Recall@%d | MRR@%d | n |" % (k, k))
    lines.append("|---|---|---|---|---|")
    for stage, s in report["stages"].items():
        if s["status"] != "ok":
            continue
        for kind in ("code", "doc", "route"):
            kb = s["by_kind"].get(kind)
            if kb:
                lines.append("| %s | %s | %.3f | %.3f | %d |"
                             % (stage, kind, kb["recall"], kb["mrr"],
                                kb["n"]))
    lines.append("")
    lines.append("Generated %s."
                 % datetime.now(timezone.utc).isoformat())
    return "\n".join(lines) + "\n"


def cmd_run(args):
    rows = load_eval(args.eval)
    stages = args.stages.split(",") if args.stages else list(DEFAULT_STAGES)
    try:
        ranked = collect_rankings(rows, stages, args.k,
                                  ranker_cmd=args.ranker_cmd,
                                  results=args.results,
                                  timeout=args.timeout)
    except EvalError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 2
    report = evaluate(ranked, rows, stages, args.k)
    report.update({"schema_version": SCHEMA_VERSION, "eval": args.eval,
                   "stages_order": stages,
                   "generated_at": datetime.now(timezone.utc).isoformat()})
    md = markdown_table(report, args.eval)
    if args.md:
        with open(args.md, "w", encoding="utf-8") as fh:
            fh.write(md)
    else:
        sys.stdout.write(md)
    out_json = args.json
    if out_json is None and args.md:
        out_json = args.md + ".json"
    if out_json:
        with open(out_json, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2,
                      sort_keys=True)
            fh.write("\n")
    else:
        sys.stdout.write("```json\n" + json.dumps(report, ensure_ascii=False,
                                                  sort_keys=True)
                         + "\n```\n")
    if any(s.get("status") != "ok" for s in report["stages"].values()):
        return 2
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="score the eval set through an adapter")
    run.add_argument("--eval", required=True, help="eval .jsonl path")
    src = run.add_mutually_exclusive_group(required=True)
    src.add_argument("--results", default=None,
                     help="replay rankings from JSON file")
    src.add_argument("--ranker-cmd", default=None,
                     help="shell command emitting {\"results\": [...]} "
                          "per (query, stage)")
    run.add_argument("--stages", default=",".join(DEFAULT_STAGES),
                     help="comma-separated stage names")
    run.add_argument("--k", type=int, default=10)
    run.add_argument("--timeout", type=int, default=120)
    run.add_argument("--json", default=None, help="write JSON report here")
    run.add_argument("--md", default=None, help="write markdown report here "
                     "(default: stdout)")
    args = parser.parse_args(argv)
    if args.command == "run":
        try:
            return cmd_run(args)
        except EvalError as exc:
            print(json.dumps({"ok": False, "error": str(exc)}),
                  file=sys.stderr)
            return 1
        except OSError as exc:
            print(json.dumps({"ok": False, "error": str(exc)}),
                  file=sys.stderr)
            return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
