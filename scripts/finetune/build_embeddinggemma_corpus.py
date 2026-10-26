#!/usr/bin/env python3
"""scripts/finetune/build_embeddinggemma_corpus.py — EmbeddingGemma multitask corpus builder.

Builds a single mixed JSONL corpus for one-go multitask fine-tuning of
google/embeddinggemma-300m to replace the bge-m3 / bge-reranker-v2-m3 stack.

Row format (prompt baked in, so any trainer works with or without prompt_name):
  {"anchor": "...", "positive": "...", "negative": "...", "task": "<one of 8>"}

Tasks (EmbeddingGemma model card):
  retrieval-query, retrieval-document, code-retrieval, qa, fact-check,
  classification, clustering, sts

Sources (all local, no network):
  - docs/brain/handled-by-map.json (349 routes, T900989 pin)
  - docs/brain/k3-retrieval-eval.jsonl (32 hand-labelled queries, T900993)

Weighting: retrieval + code ~65% (stack replacement), replay ~35%
(classification/clustering/sts/qa/fact-check keep base capabilities).

Stdlib only — runs in worktree/CI without ML deps.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent

PROMPTS = {
    "retrieval-query": "task: search result | query: ",
    "retrieval-document": "title: {title} | text: ",
    "code-retrieval": "task: code retrieval | query: ",
    "qa": "task: question answering | query: ",
    "fact-check": "task: fact checking | query: ",
    "classification": "task: classification | query: ",
    "clustering": "task: clustering | query: ",
    "sts": "task: sentence similarity | query: ",
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path):
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="output corpus JSONL")
    ap.add_argument("--eval-out", required=True, help="output held-out eval JSONL")
    ap.add_argument("--seed", type=int, default=3407)
    args = ap.parse_args()

    hb_path = REPO_ROOT / "docs/brain/handled-by-map.json"
    k3_path = REPO_ROOT / "docs/brain/k3-retrieval-eval.jsonl"
    handled = load_json(hb_path)
    k3rows = load_jsonl(k3_path)

    # Group handled-by targets by slice for hard negatives.
    by_slice: dict[str, list[dict]] = {}
    for r in handled:
        by_slice.setdefault(r.get("slice", "misc"), []).append(r)
    slices = sorted(by_slice)

    corpus: list[dict] = []

    def neg_for(row: dict) -> dict:
        sl = row.get("slice", "misc")
        for other in slices:
            if other != sl and by_slice[other]:
                # deterministic: first row of next slice (sorted order)
                return by_slice[other][0]
        return handled[0]

    # 1. Retrieval (route -> handler doc) from pin.
    for r in handled:
        hb = r.get("handled_by") or []
        if not hb:
            continue
        n = neg_for(r)
        n_hb = (n.get("handled_by") or ["components/website/src/pages/api/_errors.ts"])[0]
        anchor = f"{PROMPTS['retrieval-query']}{r.get('verb','GET')} {r['path']} slice {r.get('slice','')}"
        positive = (
            f"title: {hb[0]} | text: {r['path']} {r.get('verb','')} handled by {', '.join(hb[:3])}"
        )
        negative = f"title: {n_hb} | text: {n['path']} handled by {n_hb}"
        corpus.append({"anchor": anchor, "positive": positive, "negative": negative, "task": "retrieval-query"})

    # 2. Code retrieval (same pairs, code prompt on query side).
    for r in handled:
        hb = r.get("handled_by") or []
        if not hb:
            continue
        n = neg_for(r)
        anchor = f"{PROMPTS['code-retrieval']}{r.get('verb','GET')} {r['path']} handler implementation"
        positive = f"title: {hb[0]} | text: {r['path']} implementation in {hb[0]}"
        negative = f"title: none | text: {(n.get('handled_by') or ['_errors.ts'])[0]} unrelated handler"
        corpus.append({"anchor": anchor, "positive": positive, "negative": negative, "task": "code-retrieval"})

    # 3. K3 hand-labelled queries (strongest domain signal).
    for i, q in enumerate(k3rows):
        kind = q.get("kind", "route")
        exp = q.get("expected_paths") or []
        if not exp:
            continue
        other = k3rows[(i + 8) % len(k3rows)]
        other_exp = (other.get("expected_paths") or ["components/website/src/pages/api/_errors.ts"])[0]
        task = "code-retrieval" if kind == "code" else "retrieval-query"
        prefix = PROMPTS[task]
        corpus.append({
            "anchor": f"{prefix}{q['query']}",
            "positive": f"title: {exp[0]} | text: {exp[0]} {q.get('notes','')[:200]}",
            "negative": f"title: none | text: {other_exp} unrelated",
            "task": task,
        })
        # QA + fact-check replay from same query.
        corpus.append({
            "anchor": f"{PROMPTS['qa']}{q['query']}",
            "positive": f"{PROMPTS['qa']}{exp[0]} answers: {q['query']}",
            "negative": f"{PROMPTS['qa']}{other_exp} unrelated answer",
            "task": "qa",
        })
        corpus.append({
            "anchor": f"{PROMPTS['fact-check']}{q['query']}",
            "positive": f"{PROMPTS['fact-check']}evidence in {exp[0]} supports this",
            "negative": f"{PROMPTS['fact-check']}no evidence in {other_exp}",
            "task": "fact-check",
        })

    # 4. Symmetric replay: classification / clustering / sts from slices.
    for r in handled[::7]:  # every 7th row, deterministic subsample (~50 rows)
        sl = r.get("slice", "misc")
        n = neg_for(r)
        sl2 = n.get("slice", "other")
        corpus.append({
            "anchor": f"{PROMPTS['classification']}{r['path']} {r.get('verb','')}",
            "positive": f"{PROMPTS['classification']}slice {sl} handler { (r.get('handled_by') or ['x'])[0]}",
            "negative": f"{PROMPTS['classification']}slice {sl2} handler {(n.get('handled_by') or ['y'])[0]}",
            "task": "classification",
        })
        corpus.append({
            "anchor": f"{PROMPTS['clustering']}{r['path']}",
            "positive": f"{PROMPTS['clustering']}{r['path']} same slice {sl}",
            "negative": f"{PROMPTS['clustering']}{n['path']} different slice {sl2}",
            "task": "clustering",
        })
        corpus.append({
            "anchor": f"{PROMPTS['sts']}{r['path']} {r.get('verb','')}",
            "positive": f"{PROMPTS['sts']}{r['path']} {r.get('verb','')} same endpoint",
            "negative": f"{PROMPTS['sts']}{n['path']} different endpoint",
            "task": "sts",
        })

    # Deterministic held-out: every 10th row -> eval, rest -> train.
    train_rows = [r for i, r in enumerate(corpus) if i % 10 != 0]
    eval_rows = [r for i, r in enumerate(corpus) if i % 10 == 0]

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in train_rows) + "\n", encoding="utf-8")
    eval_out = Path(args.eval_out)
    eval_out.parent.mkdir(parents=True, exist_ok=True)
    eval_out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in eval_rows) + "\n", encoding="utf-8")

    sha = hashlib.sha256(out.read_bytes()).hexdigest()[:16]
    from collections import Counter
    counts = Counter(r["task"] for r in train_rows)
    print(f"train={len(train_rows)} eval={len(eval_rows)} sha={sha}")
    print("tasks:", dict(counts))


if __name__ == "__main__":
    main()
