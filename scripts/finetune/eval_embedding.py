#!/usr/bin/env python3
"""scripts/finetune/eval_embedding.py — triplet eval + retrain suggestions.

Metric per row: cos(anchor, positive) > cos(anchor, negative) -> correct.
Reports accuracy overall + per task, and mean margin.

Usage:
  python3 scripts/finetune/eval_embedding.py --eval-corpus <eval.jsonl> \\
      --model <hf-id-or-dir> --out <report.json> [--max-seq-length 512]
  # compare base vs tuned: run twice, diff the reports.
  # no-model mode (format check only, no torch needed):
  python3 scripts/finetune/eval_embedding.py --eval-corpus <eval.jsonl> --check-only

suggest_embedding_retrain.py reads two reports (train-eval + held-out eval)
and prints optimized hyperparams for the retrain (underfit/overfit rules).
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path


def check(path: str) -> list[dict]:
    rows = [json.loads(l) for l in Path(path).read_text(encoding="utf-8").splitlines() if l.strip()]
    assert rows, "empty eval corpus"
    for r in rows:
        assert set(r) >= {"anchor", "positive", "negative", "task"}, f"bad row keys: {sorted(r)}"
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval-corpus", required=True)
    ap.add_argument("--model", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--max-seq-length", type=int, default=512)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--dims", default="768,512,256,128",
                    help="Comma-separated Matryoshka dims to score (truncate + renormalize).")
    ap.add_argument("--check-only", action="store_true")
    args = ap.parse_args()

    rows = check(args.eval_corpus)
    if args.check_only or not args.model:
        from collections import Counter
        print(f"CHECK-ONLY OK: {len(rows)} rows, tasks={dict(Counter(r['task'] for r in rows))}")
        return

    from sentence_transformers import SentenceTransformer
    import torch

    model = SentenceTransformer(args.model, model_kwargs={"torch_dtype": "float32"},
                                device="cpu" if not torch.cuda.is_available() else None)
    model.max_seq_length = args.max_seq_length

    import numpy as np

    dims = [int(d) for d in args.dims.split(",") if d.strip()]

    def trunc(e: np.ndarray, d: int) -> np.ndarray:
        v = e[:d]
        n = float((v * v).sum() ** 0.5) or 1.0
        return v / n

    def sim(a: str, b: str, d: int) -> float:
        e = model.encode([a, b], normalize_embeddings=True)
        ea, eb = trunc(np.asarray(e[0]), d), trunc(np.asarray(e[1]), d)
        return float((ea * eb).sum())

    by_dim: dict[str, dict] = {}
    for d in dims:
        per_task: dict[str, list[bool]] = {}
        margins: list[float] = []
        for r in rows:
            sp = sim(r["anchor"], r["positive"], d)
            sn = sim(r["anchor"], r["negative"], d)
            ok = sp > sn
            per_task.setdefault(r["task"], []).append(ok)
            margins.append(sp - sn)
        by_dim[str(d)] = {
            "accuracy": sum(v for vs in per_task.values() for v in vs) / len(rows),
            "mean_margin": statistics.mean(margins),
            "per_task": {t: sum(vs) / len(vs) for t, vs in per_task.items()},
        }

    full = by_dim[str(dims[0])]
    report = {
        "model": args.model,
        "rows": len(rows),
        "accuracy": full["accuracy"],
        "mean_margin": full["mean_margin"],
        "per_task": full["per_task"],
        "by_dim": by_dim,
    }
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
