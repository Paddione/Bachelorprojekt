#!/usr/bin/env python3
"""scripts/finetune/mine_hard_negatives.py — phase-3 hard-negative miner.

Replaces each row's easy (deterministic, off-slice) negative with the
model's current top confuser: the highest-similarity positive from another
row of the same task. Trains the margin where the model is actually weak
instead of re-fitting already-separated synthetics.

Guards:
  - own positive excluded (by index)
  - sim cap (default 0.95): near-duplicates are likely false negatives,
    keep the original easy negative in that case
  - --upsample TASK:N duplicates a weak task's rows N x (e.g. classification,
    the single flipped task in run-1/run-2/run-3)

Needs torch + sentence-transformers (GPU host). Deterministic output.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True, help="input train triplets JSONL")
    ap.add_argument("--model", required=True, help="ST dir or Hub id for mining embeddings")
    ap.add_argument("--out", required=True)
    ap.add_argument("--sim-cap", type=float, default=0.95)
    ap.add_argument("--upsample", default=None, help="e.g. classification:2")
    ap.add_argument("--batch-size", type=int, default=64)
    args = ap.parse_args()

    rows = load_jsonl(Path(args.corpus))
    assert rows and set(rows[0]) >= {"anchor", "positive", "negative", "task"}

    import numpy as np
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(args.model)
    pos_texts = [r["positive"] for r in rows]
    anchors = [r["anchor"] for r in rows]
    print("encoding positives...", flush=True)
    E_pos = np.asarray(model.encode(pos_texts, batch_size=args.batch_size,
                                    normalize_embeddings=True, show_progress_bar=True), dtype=np.float64)
    print("encoding anchors...", flush=True)
    E_anc = np.asarray(model.encode(anchors, batch_size=args.batch_size,
                                    normalize_embeddings=True, show_progress_bar=True), dtype=np.float64)

    tasks = [r["task"] for r in rows]
    mined, kept_easy, dsim = 0, 0, []
    out_rows = []
    for i, r in enumerate(rows):
        sims = E_anc[i] @ E_pos.T
        # same-task candidates only, own positive excluded
        best_j, best_s = -1, -1.0
        for j, t in enumerate(tasks):
            if j == i or t != r["task"]:
                continue
            if rows[j]["positive"] == r["positive"]:
                continue  # duplicate positive text across rows (same slice+handler) — false negative
            if sims[j] > best_s:
                best_s, best_j = float(sims[j]), j
        if best_j >= 0 and best_s < args.sim_cap:
            new_neg = rows[best_j]["positive"]
            dsim.append(best_s - float(E_anc[i] @ E_pos[i]))
            mined += 1
        else:
            new_neg = r["negative"]
            kept_easy += 1
        out_rows.append({"anchor": r["anchor"], "positive": r["positive"],
                         "negative": new_neg, "task": r["task"]})

    if args.upsample:
        task, n = args.upsample.split(":")
        extra = [dict(r) for r in out_rows if r["task"] == task] * (int(n) - 1)
        out_rows.extend(extra)
        print(f"upsampled {task} x{n}: +{len(extra)} rows")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in out_rows) + "\n", encoding="utf-8")
    import numpy as np2
    print(f"rows={len(out_rows)} mined={mined} kept_easy={kept_easy} "
          f"mean_hard_sim_margin={float(np2.mean(dsim)):.3f}" if dsim else "no mined rows")


if __name__ == "__main__":
    main()
