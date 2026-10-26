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


def _make_eval_callback(eval_corpus: str, sample: int = 30):
    """Gemma-cookbook pattern: triplet acc/margin on a small eval sample per log step."""
    from transformers import TrainerCallback

    rows = [json.loads(l) for l in Path(eval_corpus).read_text(encoding="utf-8").splitlines() if l.strip()][:sample]

    class _EvalCallback(TrainerCallback):
        def on_log(self, args, state, control, model=None, **kwargs):
            import numpy as np
            try:
                if model is None:
                    return
                ok, margins = 0, []
                for r in rows:
                    e = np.asarray(model.encode([r["anchor"], r["positive"], r["negative"]],
                                                normalize_embeddings=True), dtype=np.float64)
                    sp, sn = float(e[0] @ e[1]), float(e[0] @ e[2])
                    ok += sp > sn
                    margins.append(sp - sn)
                print(f"[step {state.global_step}] eval-sample n={len(rows)} "
                      f"acc={ok/len(rows):.3f} margin={float(np.mean(margins)):.3f}", flush=True)
            except Exception as e:
                print(f"[step {state.global_step}] eval-sample skipped: {e}", flush=True)

    return _EvalCallback()

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--model", default="google/embeddinggemma-300m-qat-q8_0-unquantized",
                    help="QAT-unquantized default: weights start from a quantization-robust "
                         "basin; our serving target is Q8_0 GGUF (bge-m3 precedent), so the "
                         "fine-tune should survive re-quantization. Pure fp32/bf16 serving "
                         "can use google/embeddinggemma-300m instead.")
    ap.add_argument("--measure-report", required=True)
    ap.add_argument("--eval-corpus", default=None)
    ap.add_argument("--max-seq-length", type=int, default=None)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", default="2e-5")
    ap.add_argument("--matryoshka", action="store_true", help="add Matryoshka loss 768/512/256/128")
    ap.add_argument("--output-dir", default="scripts/finetune/outputs/embed")
    ap.add_argument("--dtype", default="auto", choices=["auto", "fp32", "bfloat16"],
                    help="auto: bfloat16 on CUDA, fp32 on CPU (bf16 CPU training is slow). "
                         "Note: EmbeddingGemma forbids float16; bf16/fp32 only.")
    ap.add_argument("--hub-model-id", default=None)
    ap.add_argument("--init-checkpoint", default=None,
                    help="warm start: local dir (e.g. scripts/finetune/outputs/embed-run1) or Hub id. "
                         "Phase-3 pattern: init from previous run + 1-2 epochs + low lr on hard negatives.")
    ap.add_argument("--compile", action="store_true",
                    help="torch.compile the encoder (~1.5x on CPU, first step slower).")
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
        print(f"DRY-RUN OK: model={args.model} init={args.init_checkpoint or args.model} "
              f"batch={args.batch_size} lr={args.lr} matryoshka={args.matryoshka} compile={args.compile}")
        return

    # Heavy imports only on GPU host.
    from datasets import Dataset
    from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments
    from sentence_transformers.losses import MatryoshkaLoss, MultipleNegativesRankingLoss
    import torch

    dtype = args.dtype
    if dtype == "auto":
        dtype = "bfloat16" if torch.cuda.is_available() else "float32"
    dtype = {"bfloat16": torch.bfloat16, "float32": torch.float32,
             "fp32": torch.float32, "float16": torch.float16}[dtype]
    init = args.init_checkpoint or args.model
    model = SentenceTransformer(init, model_kwargs={"torch_dtype": dtype})
    if args.compile:
        try:
            model._first_module().auto_model.compile()
            print("torch.compile enabled on encoder")
        except Exception as e:
            print(f"torch.compile skipped: {e}")
    model.max_seq_length = seq_len

    # Prompt parity (Gemma cookbook pattern): baked corpus prefixes must match the
    # model's native prompts, otherwise train/serve drift silently. qa/fact-check
    # have no native counterpart and are intentionally custom (GGUF serving uses
    # baked text, llama-server has no prompt_name concept).
    native = list(dict.fromkeys(model.prompts.values())) if hasattr(model, "prompts") else []
    custom = ["task: question answering | query: ", "task: fact checking | query: "]
    bad = [r["anchor"][:60] for r in rows
           if not (any(r["anchor"].startswith(p) for p in native + custom)
                   or (r["anchor"].startswith("title: ") and "| text: " in r["anchor"][:80]))]
    if bad:
        raise SystemExit(f"FEHLER: {len(bad)} anchor(s) ohne nativen/custom Prefix, z.B. {bad[0]!r}")
    print(f"prompt-parity ok: {len(native)} native + {len(custom)} custom prefixes")
    ds = Dataset.from_list([{"anchor": r["anchor"], "positive": r["positive"], "negative": r["negative"]} for r in rows])
    inner = MultipleNegativesRankingLoss(model)
    loss = MatryoshkaLoss(model, inner, matryoshka_dims=[768, 512, 256, 128]) if args.matryoshka else inner
    targs = SentenceTransformerTrainingArguments(
        output_dir=args.output_dir, num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size, learning_rate=float(args.lr),
        warmup_ratio=0.1, logging_steps=50, save_steps=200,
    )
    trainer = SentenceTransformerTrainer(model=model, args=targs, train_dataset=ds, loss=loss,
                                             callbacks=[_make_eval_callback(args.eval_corpus)] if args.eval_corpus else None)
    trainer.train()
    model.save_pretrained(args.output_dir)
    print(f"saved to {args.output_dir}")
    if args.hub_model_id:
        model.push_to_hub(args.hub_model_id)
        print(f"pushed to {args.hub_model_id}")


if __name__ == "__main__":
    main()
