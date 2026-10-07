#!/usr/bin/env python3
"""
Fine-tuning of Qwen3.5-2B (T900978 pilot, default --model-size 2b) or
Qwen3.5-4B-MTP (--model-size 4b-mtp, shipped run) on the RTX 5070 Ti (16 GB).
Uses Unsloth. Successor of the retired Qwen3-4B-2507 and Qwen2.5-7B-BP trainings.

Default (--precision 16bit): full bf16 checkpoint + LoRA r=32 — no quantization
noise in the base weights, cleaner merged-16bit/GGUF export. Needs ~11-13 GB.
Optional (--precision 4bit): QLoRA on the bnb-4bit checkpoint (~7 GB) for when
the GPU must be shared. Full fine-tuning does NOT fit: ~27 GB across both GPUs,
and the 8 GB card rules out DDP (see TRAINING_PLAN.md §3).

Data:   .agents/training/dataset_train.jsonl  (see DATASET_PLAN.md, >=1000 unique)
Output: qwen35_4b_bp_lora/ (16-bit, default) or ..._lora_4bit/ — GGUF export
        via export_model.py (expects the default 16-bit adapter).

GPU-PREFLIGHT: the 5070 Ti also hosts the Qwen3.8-27B orchestrator rail
(qwen38-gsq-iq3xxs.service, ~15/16 GB). Stop the rail first
(systemctl --user stop qwen38-gsq-iq3xxs), restore it after training.
The script aborts if free VRAM is insufficient; override with --force.

Cloud alternative (ADR-007 primary path): task finetune:hf-jobs:train with the
same dataset (see scripts/finetune/README.md).
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MIN_FREE_MIB = {"16bit": 13_000, "4bit": 9_000}

# T900979 P2: model-size specs including 0.8b minimal instruct worker.
# 2B pilot: unsloth/Qwen3.5-2B, 16-bit LoRA r=32.
# 4B-MTP branch kept for reproducibility of the shipped 4B run.
MODEL_SPECS = {
    "0.8b": {
        "hf_16bit": "unsloth/Qwen3.5-0.8B",
        "hf_4bit": "unsloth/Qwen3.5-0.8B-bnb-4bit",
        "lora_16bit": "qwen35_08b_bp_lora",
        "lora_4bit": "qwen35_08b_bp_lora_4bit",
        "dataset": "dataset_08b_train.jsonl",
        "lora_r_16bit": 16,
    },
    "2b": {
        "hf_16bit": "unsloth/Qwen3.5-2B",
        "hf_4bit": "unsloth/Qwen3.5-2B-bnb-4bit",
        "lora_16bit": "qwen35_2b_bp_lora",
        "lora_4bit": "qwen35_2b_bp_lora_4bit",
        "dataset": "dataset_2b_train.jsonl",
        "lora_r_16bit": 32,
    },
    "4b-mtp": {
        "hf_16bit": "unsloth/Qwen3.5-4B",
        "hf_4bit": "unsloth/Qwen3.5-4B-bnb-4bit",
        "lora_16bit": "qwen35_4b_bp_lora",
        "lora_4bit": "qwen35_4b_bp_lora_4bit",
        "dataset": "dataset_train.jsonl",
        "lora_r_16bit": 32,
    },
    "4b": {
        "hf_16bit": "unsloth/Qwen3.5-4B",
        "hf_4bit": "unsloth/Qwen3.5-4B-bnb-4bit",
        "lora_16bit": "qwen35_4b_bp_lora",
        "lora_4bit": "qwen35_4b_bp_lora_4bit",
        "dataset": "dataset_train.jsonl",
        "lora_r_16bit": 32,
    },
}


def check_gpu_preflight(min_free_mib: int, free_mib: int | None, device: int = 1) -> tuple[bool, str]:
    """Pure helper for testing and validating GPU VRAM preflight status."""
    if free_mib is None:
        return True, "[preflight] nvidia-smi unavailable; continuing without check"
    if free_mib >= min_free_mib:
        return True, f"[preflight] GPU {device}: {free_mib} MiB free — OK"
    msg = (
        f"[preflight] GPU {device} has only {free_mib} MiB free "
        f"(need >= {min_free_mib}). The 27B rail (qwen38-gsq-iq3xxs.service, "
        "~15/16 GB) is probably still running:\n"
        "  systemctl --user stop qwen38-gsq-iq3xxs   # restore after training!\n"
        "Re-run with --force to override."
    )
    return False, msg


def gpu_preflight(min_free_mib: int, device_override: int | str | None = None) -> None:
    """Abort when the 5070 Ti is still occupied by the 27B orchestrator rail."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,uuid,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip().splitlines()
        free_by_idx = {}
        free_by_uuid = {}
        for line in out:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 3:
                idx, uuid, mem = int(parts[0]), parts[1], int(parts[2])
                free_by_idx[idx] = mem
                free_by_uuid[uuid] = mem
    except Exception as exc:  # noqa: BLE001 — preflight is advisory without nvidia-smi
        print(f"[preflight] nvidia-smi unavailable ({exc}); continuing without check")
        return

    dev_str = str(device_override) if device_override is not None else os.environ.get("CUDA_VISIBLE_DEVICES", "1").split(",")[0].strip()
    if dev_str.isdigit():
        device_id = int(dev_str)
        free_mib = free_by_idx.get(device_id, 0)
    elif dev_str in free_by_uuid:
        device_id = dev_str
        free_mib = free_by_uuid[dev_str]
    else:
        # Default to GPU 1 (RTX 5070 Ti) if environment string doesn't match
        device_id = 1
        free_mib = free_by_idx.get(1, 0)

    ok, msg = check_gpu_preflight(min_free_mib, free_mib, device=device_id)
    if ok:
        print(msg)
        return
    print(msg, file=sys.stderr)
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--precision", choices=["16bit", "4bit"], default="16bit",
                    help="16-bit LoRA (default, best quality) or QLoRA 4-bit fallback")
    ap.add_argument("--model-size", choices=["0.8b", "2b", "4b", "4b-mtp"], default="4b-mtp",
                    help="4b / 4b-mtp = Qwen3.5-4B worker training (default); "
                         "2b = Qwen3.5-2B pilot on the P1 slice; "
                         "0.8b = Qwen3.5-0.8B minimal mechanical worker")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--max-steps", type=int, default=200,
                    help="cap optimizer steps (overrides epochs when > 0; "
                         "T900978 pilot: 200 steps per notebook Vorbefund)")
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--seq-len", type=int, default=2048)
    ap.add_argument("--force", action="store_true", help="skip the VRAM preflight")
    ap.add_argument("--dry-run", action="store_true",
                    help="verify configuration, dataset paths and preflight without training")
    args = ap.parse_args()

    if not args.force:
        gpu_preflight(MIN_FREE_MIB[args.precision])

    spec = MODEL_SPECS[args.model_size]
    output_lora_dir = HERE / (
        spec["lora_16bit"] if args.precision == "16bit" else spec["lora_4bit"]
    )
    dataset_file = HERE / spec["dataset"]

    if args.dry_run:
        if not dataset_file.is_file():
            print(f"[dry-run] ERROR: dataset file not found: {dataset_file}", file=sys.stderr)
            sys.exit(1)
        model_name = spec["hf_16bit"] if args.precision == "16bit" else spec["hf_4bit"]
        print(f"[dry-run] Configuration OK: model={model_name}, precision={args.precision}, "
              f"dataset={dataset_file.name}, output={output_lora_dir.name}, "
              f"epochs={args.epochs}, max_steps={args.max_steps}, lr={args.lr}")
        return

    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "1")  # RTX 5070 Ti

    import torch
    from datasets import load_dataset
    from unsloth import FastLanguageModel
    from trl import SFTConfig, SFTTrainer

    # TO-VERIFY: base checkpoint names derived from the served GGUFs' origin;
    # confirm via pull before training.
    if args.precision == "16bit":
        model_name = spec["hf_16bit"]   # full bf16 checkpoint
        load_in_4bit = False
        lora_r = lora_alpha = spec["lora_r_16bit"]
    else:
        model_name = spec["hf_4bit"]
        load_in_4bit = True
        lora_r = lora_alpha = 16

    print(f"[{args.precision}] Loading base model: {model_name} ...")
    try:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=model_name,
            max_seq_length=args.seq_len,
            dtype=torch.bfloat16,   # native on Blackwell (50-series)
            load_in_4bit=load_in_4bit,
        )
    except Exception:
        if args.precision == "16bit":
            raise
        # Pre-quantized repo unavailable -> full checkpoint with on-the-fly 4-bit
        model_name = spec["hf_16bit"]
        print(f"Falling back to {model_name} (on-the-fly 4-bit load) ...")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=model_name,
            max_seq_length=args.seq_len,
            dtype=torch.bfloat16,
            load_in_4bit=True,
        )

    model = FastLanguageModel.get_peft_model(
        model,
        r=lora_r,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_alpha=lora_alpha,     # unsloth recommendation: alpha == r
        lora_dropout=0,            # MUST be 0 for unsloth kernels
        bias="none",               # MUST be "none" for unsloth kernels
        use_gradient_checkpointing="unsloth",  # ~30% VRAM saving
        random_state=3407,
    )

    print(f"Loading dataset from {dataset_file} ...")
    dataset = load_dataset("json", data_files={"train": str(dataset_file)}, split="train")

    def formatting_prompts_func(examples):
        # Qwen3.5-4B-MTP serves direct (non-thinking) by default with per-request
        # thinking via chat_template_kwargs; the dataset uses the direct-mode
        # template (enable_thinking False) — no <think> blocks in training.
        texts = [
            tokenizer.apply_chat_template(convo, tokenize=False, add_generation_prompt=False)
            for convo in examples["messages"]
        ]
        return {"text": texts}

    dataset = dataset.map(formatting_prompts_func, batched=True)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=args.seq_len,
        dataset_num_proc=2,
        packing=False,
        args=SFTConfig(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,    # effective batch 8
            warmup_ratio=0.03,
            num_train_epochs=args.epochs,
            max_steps=args.max_steps,
            learning_rate=args.lr,
            fp16=False,
            bf16=True,
            logging_steps=1,
            optim="paged_adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="cosine",
            seed=3407,
            output_dir=str(HERE / "outputs"),
        ),
    )

    print(f"Training {model_name} [{args.model_size}] on the RTX 5070 Ti "
          f"({args.epochs} epochs, max {args.max_steps} steps) ...")
    trainer_stats = trainer.train()
    print(f"Training finished: {trainer_stats.metrics}")

    print(f"Saving LoRA adapter to {output_lora_dir} ...")
    model.save_pretrained(output_lora_dir)
    tokenizer.save_pretrained(output_lora_dir)
    print("Next: python3 export_model.py  (merged 16-bit + GGUF q4_k_m/q8_0)")


if __name__ == "__main__":
    main()
