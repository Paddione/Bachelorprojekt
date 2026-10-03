#!/usr/bin/env python3
"""
Evaluation for the Qwen3.5-4B-MTP BP-assistant fine-tune (CUDA/Unsloth).

Modes:
  --mode compare      base vs tuned side-by-side on dataset_val.jsonl questions
                      (loads base, generates, frees VRAM, loads adapter, regenerates)
  --mode val          tuned model over the full val set + rough command-match score
  --mode interactive  REPL against the tuned model

Sampling follows the Qwen3.5-4B-MTP spec: temp 0.8, top_k 40, top_p 0.95,
min_p 0.05, repeat_penalty 1.0. Evals run in direct (non-thinking) mode.
Same GPU preflight as training — the 27B rail must be stopped.

  python3 eval.py --mode compare --limit 8
  python3 eval.py --mode val
"""

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ADAPTER_DIR = HERE / "qwen35_4b_bp_lora"
# TO-VERIFY: base checkpoint name derived from the served GGUF's origin
# (unsloth/Qwen3.5-4B-MTP-GGUF); confirm via pull before training/eval.
BASE_MODEL = "unsloth/Qwen3.5-4B-MTP"
SEQ_LEN = 2048
MAX_NEW_TOKENS = 300
# Qwen3.5-4B-MTP measured sampling defaults
TEMPERATURE, TOP_P, TOP_K = 0.8, 0.95, 40
MIN_P, REPEAT_PENALTY = 0.05, 1.0

_bp_worker_style = False  # set via --worker-style; kept simple on purpose


def _load_model(adapter: bool):
    import torch
    from unsloth import FastLanguageModel

    name = str(ADAPTER_DIR) if adapter else BASE_MODEL
    print(f"[eval] loading {'adapter ' + str(ADAPTER_DIR.name) if adapter else 'base'} ...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=name,
        max_seq_length=SEQ_LEN,
        dtype=torch.bfloat16,
        load_in_4bit=False,
    )
    FastLanguageModel.for_inference(model)
    return model, tokenizer


def _generate(model, tokenizer, question: str) -> str:
    messages = [{"role": "user", "content": question}]
    if not _bp_worker_style:
        messages.insert(0, {"role": "system", "content":
                            "You are the Bachelorprojekt assistant. You provide direct, "
                            "accurate technical answers, terminal commands, and architecture "
                            "guidance with minimal filler and zero hallucinations."})
    prompt = tokenizer.apply_chat_template(messages, tokenize=False,
                                           add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    out = model.generate(
        **inputs,
        max_new_tokens=MAX_NEW_TOKENS,
        temperature=TEMPERATURE,
        top_p=TOP_P,
        top_k=TOP_K,
        repetition_penalty=REPEAT_PENALTY,
        do_sample=True,
    )
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    # strip any stray think block (defensive; direct mode should not emit one)
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _val_questions(limit):
    rows = [json.loads(l) for l in (HERE / "dataset_val.jsonl").read_text().splitlines()]
    qs = [r["messages"][-2]["content"] for r in rows]
    refs = [r["messages"][-1]["content"] for r in rows]
    return (qs[:limit], refs[:limit]) if limit else (qs, refs)


def _extract_commands(text):
    return re.findall(r"```(?:bash|sh|shell)?\n(.*?)```", text, re.DOTALL)


def run_compare(model, tokenizer, limit):
    questions, refs = _val_questions(limit)
    results = []
    for q in questions:
        results.append({"question": q, "base": _generate(model, tokenizer, q)})
    print("[eval] freeing base model, loading adapter ...")
    del model, tokenizer
    import torch
    torch.cuda.empty_cache()
    tuned_model, tuned_tok = _load_model(adapter=True)
    for i, q in enumerate(questions):
        results[i]["tuned"] = _generate(tuned_model, tuned_tok, q)
    for r in results:
        print("\n" + "=" * 78)
        print(f"Q: {r['question']}")
        print(f"\n-- BASE --\n{r['base']}")
        print(f"\n-- TUNED --\n{r['tuned']}")
    (HERE / "eval_results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[eval] wrote {HERE / 'eval_results.json'}")


def run_val(model, tokenizer, limit):
    questions, refs = _val_questions(limit)
    hit, total, rows = 0, 0, []
    for q, ref in zip(questions, refs):
        answer = _generate(model, tokenizer, q)
        ref_cmds = " ".join(_extract_commands(ref))
        # rough signal: does the tuned answer contain a command token from the reference?
        ref_tokens = [t for t in re.findall(r"(?:task|bash|systemctl|curl|git|python3?|node)\s+\S+",
                                            ref_cmds)]
        ok = any(tok.split()[-1].split(":")[0] in answer for tok in ref_tokens) if ref_tokens else None
        total += 1
        hit += 1 if ok else 0
        rows.append({"question": q, "reference": ref, "tuned": answer, "cmd_hit": ok})
        print(f"[val {total}] {'HIT' if ok else ('MISS' if ok is False else 'n/a')}: {q[:70]}")
    print(f"\n[eval] command-match: {hit}/{total} "
          f"(rough signal — reference commands appearing in the tuned answer)")
    (HERE / "eval_results.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[eval] wrote {HERE / 'eval_results.json'}")


def run_interactive(model, tokenizer):
    print("[eval] interactive mode — empty line or 'quit' exits")
    while True:
        try:
            q = input("\nQ> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not q or q.lower() in {"quit", "exit"}:
            break
        print(_generate(model, tokenizer, q))


def main():
    global _bp_worker_style, ADAPTER_DIR
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--mode", choices=["compare", "val", "interactive"], default="compare")
    ap.add_argument("--limit", type=int, default=8, help="cap val questions (0 = all)")
    ap.add_argument("--adapter", type=Path, default=ADAPTER_DIR)
    ap.add_argument("--worker-style", action="store_true",
                    help="drop the BP system prompt (worker-style robustness check)")
    args = ap.parse_args()
    _bp_worker_style = args.worker_style
    ADAPTER_DIR = args.adapter  # noqa: F841 — _load_model reads the module global

    sys.path.insert(0, str(HERE))
    from train_5070ti import gpu_preflight
    gpu_preflight(13_000)

    model, tokenizer = _load_model(adapter=False if args.mode == "compare" else True)
    if args.mode == "compare":
        run_compare(model, tokenizer, args.limit)
    elif args.mode == "val":
        run_val(model, tokenizer, args.limit)
    else:
        run_interactive(model, tokenizer)


if __name__ == "__main__":
    main()
