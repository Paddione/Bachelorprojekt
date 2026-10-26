#!/usr/bin/env python3
"""scripts/finetune/measure_embedding.py — token/VRAM pre-check for EmbeddingGemma.

Counterpart of measure_corpus.py for embedding triplets
(anchor/positive/negative), NOT chat messages. train_embedding.py refuses to
start without this report.

Heuristic (~4 chars/token) when transformers is absent (CI/worktree);
exact counts on the GPU host with transformers installed.
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

try:
    from transformers import AutoTokenizer  # type: ignore
    _HAVE = True
except ImportError:
    AutoTokenizer = None  # type: ignore
    _HAVE = False

CANDIDATES = [512, 768, 1024, 2048]

# 300M dense encoder: full bf16 finetune ~2.5GB weights+grads+adam states
# + activations(seq,batch). Documented estimate, not a profiling proof.
MODEL_PROFILES = {"embeddinggemma-300m": {"params_b": 0.3, "base_gb": 3.0}}


def tok_len(text: str, tok=None) -> int:
    if tok is not None:
        return len(tok.encode(text, add_special_tokens=False))
    return max(1, len(text) // 4)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=False, default=None)
    ap.add_argument("--model", default="embeddinggemma-300m")
    ap.add_argument("--out", required=False, default=None)
    ap.add_argument("--check-report", default=None)
    args = ap.parse_args()

    if args.check_report:
        rep = json.loads(Path(args.check_report).read_text(encoding="utf-8"))
        assert rep.get("format") == "embedding-triplet", "not an embedding measure report"
        assert rep.get("tokenizer_source") in ("transformers", "heuristic"), "bad tokenizer_source"
        assert rep.get("recommended_max_seq_length"), "missing recommendation"
        print(f"OK: {args.check_report} ({rep['rows']} rows, {rep['tokenizer_source']})")
        return
    assert args.corpus and args.out, "--corpus and --out required without --check-report"

    rows = [json.loads(l) for l in Path(args.corpus).read_text(encoding="utf-8").splitlines() if l.strip()]
    assert rows, "empty corpus"
    for r in rows:
        assert set(r) >= {"anchor", "positive", "negative", "task"}, f"bad row keys: {sorted(r)}"

    tok = None
    source = "heuristic"
    if _HAVE:
        try:
            tok = AutoTokenizer.from_pretrained("google/embeddinggemma-300m", trust_remote_code=True)
            source = "transformers"
        except Exception as e:
            print(f"WARN: HF tokenizer failed ({e}), heuristic fallback", flush=True)

    lens = []
    for r in rows:
        lens.append(max(tok_len(r["anchor"], tok), tok_len(r["positive"], tok), tok_len(r["negative"], tok)))
    lens.sort()
    import math
    def pct(p):
        return lens[min(len(lens) - 1, int(math.ceil(p / 100 * len(lens)) - 1))]
    trunc = {str(c): sum(1 for x in lens if x > c) for c in CANDIDATES}
    rec = next((c for c in CANDIDATES if trunc[str(c)] / len(lens) < 0.05), 2048)

    from collections import Counter
    report = {
        "format": "embedding-triplet",
        "model": args.model,
        "rows": len(rows),
        "tokenizer_source": source,
        "median": statistics.median(lens),
        "p90": pct(90),
        "p95": pct(95),
        "p99": pct(99),
        "max": max(lens),
        "truncated_rows": trunc,
        "recommended_max_seq_length": rec,
        "tasks": dict(Counter(r["task"] for r in rows)),
        "vram_note": "0.3B encoder: full bf16 ~3GB base + activations; batch 32x1024 fits 16GB (L4/5070Ti). LoRA optional.",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
