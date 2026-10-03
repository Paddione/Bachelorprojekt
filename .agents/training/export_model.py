#!/usr/bin/env python3
"""
Export the fine-tuned Qwen3.5-4B-MTP LoRA adapter:
  1. merged 16-bit checkpoint (HF format, for vLLM/HF-Jobs upload)
  2. GGUF q4_k_m (deployment quant for the :8080 worker pool) and q8_0 (archive)

The deployment target is the Windows-native llama.cpp pool on :8080
(RTX 3060 Ti, model id must STAY `Qwen3.5-4B-MTP` so the routing SSOT in
.opencode/agent-models.jsonc stays valid). Same UD-Q4_K_XL quant family as the
served base file `Qwen3.5-4B-UD-Q4_K_XL.gguf` — the provisional 98304-token
KV sizing is unchanged.

Known export-path risk: llama.cpp issue #24737 (Qwen3.5-4B GGUF 33-vs-32
block-count quirk) — smoke-test the exported GGUF before deploying the pool
(see TRAINING_PLAN.md §3).

Deploy steps after export:
  1. Copy the q4_k_m GGUF to the Windows side, e.g. F:\\models\\bp-finetune\\
  2. Stop the pool:  PowerShell  Stop-Process of the llama-server pid
     (or: stop via the launcher PID file — see start-qwen35-4b-service.ps1)
  3. Point F:\\tools\\llama.cpp\\start-qwen35-4b-service.ps1 at the new GGUF
     (keep model id Qwen3.5-4B-MTP, -np 3 -kvu -c 98304)
  4. Restart and verify:  curl http://127.0.0.1:8080/health
     and:  curl http://127.0.0.1:8080/v1/models
"""

import os

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "1")  # RTX 5070 Ti

from pathlib import Path

import torch
from unsloth import FastLanguageModel

HERE = Path(__file__).resolve().parent
LORA_DIR = HERE / "qwen35_4b_bp_lora"
MERGED_DIR = HERE / "qwen35_4b_bp_merged"
GGUF_DIR = HERE / "qwen35_4b_bp_gguf"
SEQ_LEN = 2048


def main():
    print(f"Loading LoRA adapter from {LORA_DIR} ...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=str(LORA_DIR),
        max_seq_length=SEQ_LEN,
        dtype=torch.bfloat16,
        load_in_4bit=True,
    )

    print(f"Merging to 16-bit and saving to {MERGED_DIR} ...")
    model.save_pretrained_merged(str(MERGED_DIR), tokenizer, save_method="merged_16bit")

    print(f"Exporting GGUF (q4_k_m, q8_0) to {GGUF_DIR} ...")
    model.save_pretrained_gguf(
        str(GGUF_DIR),
        tokenizer,
        quantization_method="q4_k_m",
    )
    model.save_pretrained_gguf(
        str(GGUF_DIR),
        tokenizer,
        quantization_method="q8_0",
    )

    print(f"\nExport finished:\n  merged 16-bit: {MERGED_DIR}\n  GGUF:          {GGUF_DIR}")
    print(__doc__.split("Deploy steps after export:")[1])


if __name__ == "__main__":
    main()
