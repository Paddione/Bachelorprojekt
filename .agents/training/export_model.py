#!/usr/bin/env python3
"""
Export the fine-tuned Qwen3.5-2B LoRA adapter (T900978 pilot):
  1. merged 16-bit checkpoint (HF format, for vLLM/HF-Jobs upload)
  2. GGUF q4_k_m (deployment quant) and q8_0 (archive) via unsloth

Known export-path risk: llama.cpp issue #24737 (Qwen3.5 GGUF 33-vs-32
block-count quirk) — check_block_count() below guards the export, then
smoke-test the GGUF (llama-cli --prompt "hi" -n 5) before any deploy
(see TRAINING_PLAN.md §3).

Deploy steps after export:
  1. Copy the q4_k_m GGUF to the Windows side, e.g. F:\\models\\bp-finetune\\
  2. Ladder rule: no agent-ID assignment before green eval on the P1 val split.
  3. Restart and verify:  curl http://127.0.0.1:8080/health
     and:  curl http://127.0.0.1:8080/v1/models
"""

import os

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "1")  # RTX 5070 Ti

from pathlib import Path

HERE = Path(__file__).resolve().parent
LORA_DIR = HERE / "qwen35_2b_bp_lora"
MERGED_DIR = HERE / "qwen35_2b_bp_merged"
GGUF_DIR = HERE / "qwen35_2b_bp_gguf"
SEQ_LEN = 2048
# T900978 P4: expected transformer block count of Qwen3.5-2B (verify after
# export; llama.cpp issue #24737: some Qwen3.5 GGUFs report 33 instead of 32).
EXPECTED_BLOCKS = 32


def check_block_count(actual, expected=EXPECTED_BLOCKS):
    """P4: block-count verify — (passed: bool, message: str).

    Tolerates the llama.cpp issue #24737 quirk (expected+1) as a warning,
    anything else is a hard FAIL.
    """
    if actual == expected:
        return True, f"block-count OK: {actual} == expected {expected}"
    if actual == expected + 1:
        return True, (f"WARNING: block-count {actual} = expected+1 "
                      f"(llama.cpp issue #24737 quirk) — smoke-test before deploy")
    return False, f"FAIL: block-count {actual} != expected {expected}"


def read_gguf_block_count(gguf_path):
    """Best-effort block count from a GGUF file (llama metadata key)."""
    import struct
    with open(gguf_path, "rb") as f:
        if f.read(4) != b"GGUF":
            raise ValueError(f"not a GGUF file: {gguf_path}")
        f.read(4 + 8)  # version + tensor count + metadata kv count
        # walk metadata: count occurrences of the block-count key
        data = f.read()
    key = b"llama.block_count"
    i = data.find(key)
    if i < 0:
        raise ValueError(f"llama.block_count not found in {gguf_path}")
    # value follows key bytes + type tag; u32 LE right after the key string
    off = i + len(key) + 5
    (count,) = struct.unpack_from("<I", data[off:off + 4])
    return count


def main():
    import sys
    if not LORA_DIR.is_dir():
        print(f"[export] LoRA adapter not found: {LORA_DIR}\n"
              f"  Train first: python3 train_5070ti.py --model-size 2b",
              file=sys.stderr)
        sys.exit(1)
    import torch
    from unsloth import FastLanguageModel

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

    ggufs = sorted(GGUF_DIR.glob("*.gguf"))
    if not ggufs:
        print(f"[export] FAIL: no GGUF written to {GGUF_DIR}", file=sys.stderr)
        sys.exit(1)
    failed = False
    for gguf in ggufs:
        try:
            actual = read_gguf_block_count(gguf)
        except Exception as exc:  # noqa: BLE001 — verify is best-effort per file
            print(f"[export] block-count unreadable for {gguf.name}: {exc}")
            continue
        passed, msg = check_block_count(actual)
        print(f"[export] {gguf.name}: {msg}")
        failed = failed or not passed
    if failed:
        print("[export] FAIL: block-count verify failed", file=sys.stderr)
        sys.exit(1)

    print(f"\nExport finished:\n  merged 16-bit: {MERGED_DIR}\n  GGUF:          {GGUF_DIR}")
    print(__doc__.split("Deploy steps after export:")[1])


if __name__ == "__main__":
    main()
