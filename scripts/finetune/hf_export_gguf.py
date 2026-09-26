#!/usr/bin/env python3
"""Export a Hub LoRA adapter to a persistent GGUF Hub repository in an HF Job."""
from __future__ import annotations

import argparse
import json
import os


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-repo", required=True)
    parser.add_argument("--gguf-repo", required=True)
    parser.add_argument("--quantization", default="q4_k_m")
    args = parser.parse_args()
    if not os.environ.get("HF_TOKEN"):
        parser.error("HF_TOKEN is required to preserve the GGUF artifact")

    from huggingface_hub import hf_hub_download
    from unsloth import FastLanguageModel

    adapter_config = json.loads(open(hf_hub_download(args.adapter_repo, "adapter_config.json"), encoding="utf-8").read())
    base = adapter_config.get("base_model_name_or_path", "").lower()
    qwen35 = "qwen3.5" in base or "qwen3_5" in base
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.adapter_repo,
        max_seq_length=2048,
        load_in_4bit=not qwen35,
        load_in_16bit=qwen35,
    )
    model.push_to_hub_gguf(
        args.gguf_repo,
        tokenizer,
        quantization_method=args.quantization,
        token=os.environ["HF_TOKEN"],
    )
    print(f"GGUF uploaded to {args.gguf_repo}")


if __name__ == "__main__":
    main()
