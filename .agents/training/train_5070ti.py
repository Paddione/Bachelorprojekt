#!/usr/bin/env python3
"""
Fine-tuning of Qwen3.5-4B-MTP (direct/non-thinking default) on the RTX 5070 Ti (16 GB).
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


def gpu_preflight(min_free_mib: int) -> None:
    """Abort when the 5070 Ti is still occupied by the 27B orchestrator rail."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip().splitlines()
        free = {int(line.split(",")[0].strip()): int(line.split(",")[1].strip()) for line in out}
    except Exception as exc:  # noqa: BLE001 — preflight is advisory without nvidia-smi
        print(f"[preflight] nvidia-smi unavailable ({exc}); continuing without check")
        return
    device = int(os.environ.get("CUDA_VISIBLE_DEVICES", "1").split(",")[0])
    free_mib = free.get(device, 0)
    if free_mib >= min_free_mib:
        print(f"[preflight] GPU {device}: {free_mib} MiB free — OK")
        return
    print(
        f"[preflight] GPU {device} has only {free_mib} MiB free "
        f"(need >= {min_free_mib}). The 27B rail (qwen38-gsq-iq3xxs.service, "
        "~15/16 GB) is probably still running:\n"
        "  systemctl --user stop qwen38-gsq-iq3xxs   # restore after training!\n"
        "Re-run with --force to override.",
        file=sys.stderr,
    )
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--precision", choices=["16bit", "4bit"], default="16bit",
                    help="16-bit LoRA (default, best quality) or QLoRA 4-bit fallback")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--seq-len", type=int, default=2048)
    ap.add_argument("--force", action="store_true", help="skip the VRAM preflight")
    args = ap.parse_args()

    if not args.force:
        gpu_preflight(MIN_FREE_MIB[args.precision])

    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "1")  # RTX 5070 Ti

    import torch
    from datasets import load_dataset
    from unsloth import FastLanguageModel
    from trl import SFTConfig, SFTTrainer

    output_lora_dir = HERE / (
        "qwen35_4b_bp_lora" if args.precision == "16bit" else "qwen35_4b_bp_lora_4bit"
    )
    dataset_file = HERE / "dataset_train.jsonl"

    # TO-VERIFY: base checkpoint name derived from the served GGUF's origin
    # (unsloth/Qwen3.5-4B-MTP-GGUF); confirm via pull before training.
    if args.precision == "16bit":
        model_name = "unsloth/Qwen3.5-4B-MTP"   # full bf16 checkpoint
        load_in_4bit = False
        lora_r = lora_alpha = 32
    else:
        model_name = "unsloth/Qwen3.5-4B-MTP-bnb-4bit"
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
        model_name = "unsloth/Qwen3.5-4B-MTP"
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

    print(f"Training Qwen3.5-4B-MTP on the RTX 5070 Ti ({args.epochs} epochs) ...")
    trainer_stats = trainer.train()
    print(f"Training finished: {trainer_stats.metrics}")

    print(f"Saving LoRA adapter to {output_lora_dir} ...")
    model.save_pretrained(output_lora_dir)
    tokenizer.save_pretrained(output_lora_dir)
    print("Next: python3 export_model.py  (merged 16-bit + GGUF q4_k_m/q8_0)")


if __name__ == "__main__":
    main()
