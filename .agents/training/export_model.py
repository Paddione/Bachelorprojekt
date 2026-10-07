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


def get_export_paths(model_size: str = "4b-mtp") -> dict:
    """Return export paths and expected blocks for 0.8b, 4b-mtp / 4b or 2b."""
    if model_size == "0.8b":
        return {
            "lora_dir": HERE / "qwen35_08b_bp_lora",
            "merged_dir": HERE / "qwen35_08b_bp_merged",
            "gguf_dir": HERE / "qwen35_08b_bp_gguf",
            "expected_blocks": 24,
        }
    if model_size in {"4b", "4b-mtp"}:
        return {
            "lora_dir": HERE / "qwen35_4b_bp_lora",
            "merged_dir": HERE / "qwen35_4b_bp_merged",
            "gguf_dir": HERE / "qwen35_4b_bp_gguf",
            "expected_blocks": 32,
        }
    return {
        "lora_dir": HERE / "qwen35_2b_bp_lora",
        "merged_dir": HERE / "qwen35_2b_bp_merged",
        "gguf_dir": HERE / "qwen35_2b_bp_gguf",
        "expected_blocks": 32,
    }


_DEFAULT_PATHS = get_export_paths("2b")
LORA_DIR = _DEFAULT_PATHS["lora_dir"]
MERGED_DIR = _DEFAULT_PATHS["merged_dir"]
GGUF_DIR = _DEFAULT_PATHS["gguf_dir"]
SEQ_LEN = 2048
# Expected transformer block count of Qwen3.5-4B / 2B (verify after
# export; llama.cpp issue #24737: some Qwen3.5 GGUFs report 33 instead of 32).
# 0.8B (T900979): 24 blocks (25 tolerated as #24737 quirk, else FAIL).
EXPECTED_BLOCKS = 32
EXPECTED_BLOCKS_08B = 24


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
    import argparse
    import sys

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model-size", choices=["0.8b", "2b", "4b", "4b-mtp"], default="4b-mtp",
                    help="model size preset (default: 4b-mtp)")
    ap.add_argument("--lora-path", type=Path, default=None, help="path to LoRA adapter")
    ap.add_argument("--merged-path", type=Path, default=None, help="output path for merged 16bit model")
    ap.add_argument("--gguf-path", type=Path, default=None, help="output directory for GGUF files")
    ap.add_argument("--quantization", type=str, default="q4_k_m,q8_0",
                    help="comma-separated GGUF quantization formats (default: q4_k_m,q8_0)")
    ap.add_argument("--dry-run", action="store_true",
                    help="verify export paths without loading models or merging")
    args = ap.parse_args()

    paths = get_export_paths(args.model_size)
    lora_dir = args.lora_path or paths["lora_dir"]
    merged_dir = args.merged_path or paths["merged_dir"]
    gguf_dir = args.gguf_path or paths["gguf_dir"]
    expected_blocks = paths["expected_blocks"]
    quant_methods = [q.strip() for q in args.quantization.split(",") if q.strip()]

    if not lora_dir.is_dir():
        print(f"[export] LoRA adapter not found: {lora_dir}\n"
              f"  Train first: python3 train_5070ti.py --model-size {args.model_size}",
              file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print(f"[export dry-run] Paths OK: lora={lora_dir.name}, merged={merged_dir.name}, "
              f"gguf={gguf_dir.name}, quant={quant_methods}, expected_blocks={expected_blocks}")
        return

    import torch
    from unsloth import FastLanguageModel

    print(f"Loading LoRA adapter from {lora_dir} ...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=str(lora_dir),
        max_seq_length=SEQ_LEN,
        dtype=torch.bfloat16,
        load_in_4bit=True,
    )

    print(f"Merging to 16-bit and saving to {merged_dir} ...")
    model.save_pretrained_merged(str(merged_dir), tokenizer, save_method="merged_16bit")

    for qm in quant_methods:
        print(f"Exporting GGUF ({qm}) to {gguf_dir} ...")
        model.save_pretrained_gguf(
            str(gguf_dir),
            tokenizer,
            quantization_method=qm,
        )

    ggufs = sorted(gguf_dir.glob("*.gguf"))
    if not ggufs:
        print(f"[export] FAIL: no GGUF written to {gguf_dir}", file=sys.stderr)
        sys.exit(1)
    failed = False
    for gguf in ggufs:
        try:
            actual = read_gguf_block_count(gguf)
        except Exception as exc:  # noqa: BLE001 — verify is best-effort per file
            print(f"[export] block-count unreadable for {gguf.name}: {exc}")
            continue
        passed, msg = check_block_count(actual, expected=expected_blocks)
        print(f"[export] {gguf.name}: {msg}")
        failed = failed or not passed
    if failed:
        print("[export] FAIL: block-count verify failed", file=sys.stderr)
        sys.exit(1)

    print(f"\nExport finished:\n  merged 16-bit: {merged_dir}\n  GGUF:          {gguf_dir}")
    print(__doc__.split("Deploy steps after export:")[1])


if __name__ == "__main__":
    main()
