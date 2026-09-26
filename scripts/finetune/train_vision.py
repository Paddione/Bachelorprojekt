#!/usr/bin/env python3
"""Fine-tune Qwen3-VL on screenshot/image conversations with Unsloth QLoRA.

Corpus: JSONL rows with ``messages``. A user content list must include at least
one ``{"type":"image","image":"relative/or/absolute/path.png"}`` block and
assistant answers. Image paths are resolved relative to the corpus file.
``--dry-run`` validates paths and roles without importing the GPU stack.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def read_rows(corpus: Path) -> tuple[list[dict], int]:
    if not corpus.is_file():
        raise ValueError(f"corpus not found: {corpus}")
    rows: list[dict] = []
    image_count = 0
    for line_no, line in enumerate(corpus.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"line {line_no}: invalid JSON: {exc}") from exc
        messages = row.get("messages")
        if not isinstance(messages, list) or not messages:
            raise ValueError(f"line {line_no}: messages must be a nonempty list")
        if not any(m.get("role") == "assistant" and m.get("content") for m in messages):
            raise ValueError(f"line {line_no}: missing assistant answer")
        for message in messages:
            if message.get("role") not in ("system", "user", "assistant", "tool"):
                raise ValueError(f"line {line_no}: invalid message role")
            for block in message.get("content", []) if isinstance(message.get("content"), list) else []:
                if not isinstance(block, dict):
                    raise ValueError(f"line {line_no}: content blocks must be objects")
                if block.get("type") != "image":
                    continue
                if message["role"] != "user" or not isinstance(block.get("image"), str):
                    raise ValueError(f"line {line_no}: user image block needs an image path")
                image_path = Path(block["image"])
                if not image_path.is_absolute():
                    image_path = corpus.parent / image_path
                if not image_path.is_file():
                    raise ValueError(f"line {line_no}: image not found: {image_path}")
                block["image"] = str(image_path.resolve())
                image_count += 1
        rows.append({"messages": messages})
    if not rows or not image_count:
        raise ValueError("vision corpus needs at least one image example")
    return rows, image_count


def materialize_images(rows: list[dict]) -> list[dict]:
    from PIL import Image

    for row in rows:
        for message in row["messages"]:
            if not isinstance(message.get("content"), list):
                continue
            for block in message["content"]:
                if block.get("type") == "image":
                    with Image.open(block["image"]) as source:
                        image = source.convert("RGB")
                    image.thumbnail((768, 768))
                    block["image"] = image
    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", required=True, help="Qwen3-VL HF ID or local snapshot path")
    parser.add_argument("--corpus", required=True, type=Path)
    parser.add_argument("--eval-corpus", type=Path)
    parser.add_argument("--max-seq-length", required=True, type=int)
    parser.add_argument("--output-dir", default="outputs/vision", type=Path)
    parser.add_argument("--max-steps", default=60, type=int)
    parser.add_argument("--learning-rate", default=2e-4, type=float)
    parser.add_argument("--min-free-vram-gb", default=10.0, type=float)
    parser.add_argument("--freeze-vision-layers", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.max_seq_length <= 0 or args.max_steps <= 0:
        raise SystemExit("max-seq-length and max-steps must be positive")
    model_name = args.model.lower()
    model_path = Path(args.model)
    if model_path.is_dir() and (model_path / "config.json").is_file():
        model_type = json.loads((model_path / "config.json").read_text(encoding="utf-8")).get("model_type")
        if model_type != "qwen3_vl":
            raise SystemExit(f"expected a Qwen3-VL snapshot, found {model_type}")
    elif "qwen3-vl" not in model_name and "qwen3_vl" not in model_name:
        raise SystemExit("--model must identify Qwen3-VL")
    try:
        train_rows, images = read_rows(args.corpus)
        eval_rows = read_rows(args.eval_corpus)[0] if args.eval_corpus else None
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    print(f"vision corpus: {len(train_rows)} rows, {images} images")
    if args.dry_run:
        print("OK: vision corpus and model route validated; GPU not loaded")
        return 0

    from unsloth import FastVisionModel
    from unsloth.trainer import UnslothVisionDataCollator
    import torch
    from trl import SFTConfig, SFTTrainer

    if not torch.cuda.is_available():
        raise SystemExit("no visible CUDA GPU")
    free_bytes, total_bytes = torch.cuda.mem_get_info()
    print(f"CUDA 0: {torch.cuda.get_device_name(0)}, free {free_bytes / 2**30:.1f}/{total_bytes / 2**30:.1f} GiB")
    if free_bytes / 2**30 < args.min_free_vram_gb:
        raise SystemExit("insufficient free VRAM; free the training GPU before loading the model")

    model, processor = FastVisionModel.from_pretrained(
        model_name=args.model,
        max_seq_length=args.max_seq_length,
        load_in_4bit=True,
    )
    model = FastVisionModel.get_peft_model(
        model,
        finetune_vision_layers=not args.freeze_vision_layers,
        finetune_language_layers=True,
        finetune_attention_modules=True,
        finetune_mlp_modules=True,
        r=16,
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        random_state=3407,
        use_rslora=False,
        target_modules="all-linear",
    )
    collator = UnslothVisionDataCollator(
        model,
        processor,
        max_seq_length=args.max_seq_length,
        train_on_responses_only=True,
        instruction_part="<|im_start|>user\n",
        response_part="<|im_start|>assistant\n",
        completion_only_loss=True,
    )
    trainer = SFTTrainer(
        model=model,
        processing_class=processor.tokenizer,
        data_collator=collator,
        train_dataset=materialize_images(train_rows),
        eval_dataset=materialize_images(eval_rows) if eval_rows else None,
        args=SFTConfig(
            output_dir=str(args.output_dir),
            max_length=args.max_seq_length,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=4,
            max_steps=args.max_steps,
            learning_rate=args.learning_rate,
            warmup_ratio=0.03,
            optim="adamw_8bit",
            lr_scheduler_type="cosine",
            logging_steps=1,
            eval_strategy="steps" if eval_rows else "no",
            eval_steps=10 if eval_rows else None,
            remove_unused_columns=False,
            dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True},
            report_to="none",
        ),
    )
    trainer.train()
    adapter_dir = args.output_dir / "adapter"
    model.save_pretrained(str(adapter_dir))
    processor.save_pretrained(str(adapter_dir))
    print(f"vision adapter saved: {adapter_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
