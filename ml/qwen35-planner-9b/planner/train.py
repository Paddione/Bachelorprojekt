"""U7: QLoRA SFT of Qwen3.5-9B on the mixed set (runs in ml/qwen35-training/train/.venv).

Vision tower frozen, LoRA on all language linear layers, loss on assistant tokens only.
--dry-run validates the data and the chat-template rendering without loading weights.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from planner.common import DATA, OUT, read_jsonl  # noqa: E402

MODEL = "unsloth/Qwen3.5-9B"


def load_rows(path: Path) -> tuple[list[dict], int]:
    rows = read_jsonl(path)
    images = 0
    for r in rows:
        for m in r["messages"]:
            if isinstance(m["content"], list):
                for b in m["content"]:
                    if b.get("type") == "image":
                        if not Path(b["image"]).is_file():
                            raise SystemExit(f"image missing: {b['image']}")
                        images += 1
    return [{"messages": r["messages"]} for r in rows], images


def materialize(rows: list[dict]) -> list[dict]:
    from PIL import Image
    for r in rows:
        for m in r["messages"]:
            if isinstance(m["content"], list):
                for b in m["content"]:
                    if b.get("type") == "image" and isinstance(b["image"], str):
                        with Image.open(b["image"]) as src:
                            img = src.convert("RGB")
                        img.thumbnail((768, 768))
                        b["image"] = img
    return rows


def render_check(rows: list[dict], n: int = 3) -> None:
    """The template must keep the inline think block of the final assistant turn."""
    from transformers import AutoProcessor
    proc = AutoProcessor.from_pretrained(MODEL)

    def kind(r):
        a = r["messages"][-1]["content"]
        return ("think" if not a.startswith("<think>\n\n</think>") else "nothink",
                any(isinstance(m["content"], list) for m in r["messages"]))
    picks, seen = [], {}
    for r in rows:
        k = kind(r)
        if seen.get(k, 0) < n:
            seen[k] = seen.get(k, 0) + 1
            picks.append(r)
    for r in picks:
        msgs = [{"role": m["role"], "content": m["content"] if isinstance(m["content"], str) else
                 [b if b.get("type") != "image" else {"type": "image"} for b in m["content"]]}
                for m in r["messages"]]
        text = proc.apply_chat_template(msgs, tokenize=False)
        want = "<|im_start|>assistant\n" + r["messages"][-1]["content"][:60]
        if want not in text:
            raise SystemExit(f"template changed the assistant turn, expected {want!r}")
    print(f"render check OK on {len(picks)} samples, kinds={sorted(seen.items())}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--train", type=Path, default=DATA / "train.jsonl")
    ap.add_argument("--val", type=Path, default=DATA / "val.jsonl")
    ap.add_argument("--out", type=Path, default=OUT / "lora")
    ap.add_argument("--max-seq-length", type=int, default=16384)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--max-steps", type=int, default=-1)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=32)
    ap.add_argument("--grad-accum", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    train_rows, train_imgs = load_rows(args.train)
    val_rows, _ = load_rows(args.val)
    print(json.dumps({"train": len(train_rows), "val": len(val_rows), "train_images": train_imgs}))
    if args.dry_run:
        render_check(train_rows)
        print("OK: data and template validated; GPU not loaded")
        return 0

    from unsloth import FastVisionModel
    from unsloth.trainer import UnslothVisionDataCollator
    import torch
    from trl import SFTConfig, SFTTrainer

    if not torch.cuda.is_available():
        raise SystemExit("no visible CUDA GPU")
    model, processor = FastVisionModel.from_pretrained(MODEL, max_seq_length=args.max_seq_length,
                                                       load_in_4bit=True)
    model = FastVisionModel.get_peft_model(
        model, finetune_vision_layers=False, finetune_language_layers=True,
        finetune_attention_modules=True, finetune_mlp_modules=True,
        r=args.rank, lora_alpha=args.rank, lora_dropout=0, bias="none",
        random_state=3407, target_modules="all-linear")
    collator = UnslothVisionDataCollator(
        model, processor, max_seq_length=args.max_seq_length, train_on_responses_only=True,
        instruction_part="<|im_start|>user\n", response_part="<|im_start|>assistant\n",
        completion_only_loss=True)
    trainer = SFTTrainer(
        model=model, processing_class=processor.tokenizer, data_collator=collator,
        train_dataset=materialize(train_rows), eval_dataset=materialize(val_rows),
        args=SFTConfig(
            output_dir=str(args.out.parent / "checkpoints"), max_length=args.max_seq_length,
            per_device_train_batch_size=1, gradient_accumulation_steps=args.grad_accum,
            num_train_epochs=args.epochs, max_steps=args.max_steps, learning_rate=args.lr,
            warmup_ratio=0.03, lr_scheduler_type="cosine", optim="adamw_8bit", logging_steps=1,
            eval_strategy="steps", eval_steps=100, save_steps=200, save_total_limit=3,
            bf16=True, remove_unused_columns=False, dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True}, report_to="none"))
    t0 = time.time()
    stats = trainer.train()
    elapsed = time.time() - t0
    model.save_pretrained(str(args.out))
    processor.save_pretrained(str(args.out))
    summary = {"steps": trainer.state.global_step, "seconds": round(elapsed),
               "train_loss": stats.metrics.get("train_loss"),
               "peak_vram_gib": round(torch.cuda.max_memory_allocated() / 2**30, 2),
               "log_tail": trainer.state.log_history[-5:]}
    (args.out.parent / ("smoke.json" if args.max_steps > 0 else "train.json")).write_text(
        json.dumps(summary, indent=2))
    print(json.dumps(summary)[:1000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
