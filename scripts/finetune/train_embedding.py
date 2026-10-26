#!/usr/bin/env python3
"""scripts/finetune/train_embedding.py — one-go multitask EmbeddingGemma finetune.

Correct choice for google/embeddinggemma-300m (NOT scripts/finetune/train.py:
that is Unsloth SFT with chat templates + assistant masks and would destroy
the embedding head. Unsloth Studio LLM training likewise reports
is_embedding=false and maps triplets to user/assistant turns).

Method: sentence-transformers, single shared weights, mixed-task contrastive:
  SentenceTransformer + MultipleNegativesRankingLoss (+ optional Matryoshka
  for 768/512/256/128 truncation) over anchor/positive/negative rows whose
  EmbeddingGemma task prefixes are baked into the text by
  build_embeddinggemma_corpus.py.

  --dry-run validates corpus + measure report without torch/sentence-transformers.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def check_measure(report_path: str) -> dict:
    r = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "measure_embedding.py"), "--check-report", report_path],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        sys.stderr.write(r.stderr or r.stdout)
        raise SystemExit("FEHLER: Messbericht fehlt/ungueltig — erst task finetune-embed:measure.")
    return json.loads(Path(report_path).read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--model", default="google/embeddinggemma-300m")
    ap.add_argument("--measure-report", required=True)
    ap.add_argument("--eval-corpus", default=None)
    ap.add_argument("--max-seq-length", type=int, default=None)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", default="2e-5")
    ap.add_argument("--matryoshka", action="store_true", help="add Matryoshka loss 768/512/256/128")
    ap.add_argument("--output-dir", default="scripts/finetune/outputs/embed")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rows = [json.loads(l) for l in Path(args.corpus).read_text(encoding="utf-8").splitlines() if l.strip()]
    assert rows and set(rows[0]) >= {"anchor", "positive", "negative", "task"}, "corpus must be embedding triplets"
    report = check_measure(args.measure_report)
    if not args.dry_run and report["tokenizer_source"] != "transformers":
        raise SystemExit("FEHLER: echter Lauf verlangt tokenizer_source=transformers (GPU-Host).")
    seq_len = args.max_seq_length or report["recommended_max_seq_length"]
    assert seq_len, "missing max seq length"

    from collections import Counter
    print(f"corpus={len(rows)} tasks={dict(Counter(r['task'] for r in rows))} seq={seq_len} epochs={args.epochs}")
    if args.dry_run:
        print(f"DRY-RUN OK: model={args.model} batch={args.batch_size} lr={args.lr} matryoshka={args.matryoshka}")
        return

    # Heavy imports only on GPU host.
    from datasets import Dataset
    from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments
    from sentence_transformers.losses import MatryoshkaLoss, MultipleNegativesRankingLoss

    model = SentenceTransformer(args.model, model_kwargs={"torch_dtype": "bfloat16"})
    ds = Dataset.from_list([{"anchor": r["anchor"], "positive": r["positive"], "negative": r["negative"]} for r in rows])
    inner = MultipleNegativesRankingLoss(model)
    loss = MatryoshkaLoss(model, inner, matryoshka_dims=[768, 512, 256, 128]) if args.matryoshka else inner
    targs = SentenceTransformerTrainingArguments(
        output_dir=args.output_dir, num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size, learning_rate=float(args.lr),
        warmup_ratio=0.1, logging_steps=50, save_steps=200,
    )
    trainer = SentenceTransformerTrainer(model=model, args=targs, train_dataset=ds, loss=loss)
    trainer.train()
    model.save_pretrained(args.output_dir)
    print(f"saved to {args.output_dir}")


if __name__ == "__main__":
    main()
