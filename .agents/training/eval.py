#!/usr/bin/env python3
"""
Evaluation for the Qwen3.5-2B (T900978 pilot, default) BP-assistant fine-tune (CUDA/Unsloth).
Ladder rule: no agent-ID assignment before green eval on the P1 val split.

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


def get_eval_config(model_size: str = "4b-mtp") -> dict:
    """Return eval paths and model specs for 4b-mtp / 4b or 2b."""
    if model_size in {"4b", "4b-mtp"}:
        return {
            "base_model": "unsloth/Qwen3.5-4B",
            "adapter_dir": HERE / "qwen35_4b_bp_lora",
            "val_file": HERE / "dataset_val.jsonl",
            "results_file": HERE / "eval_results.json",
        }
    return {
        "base_model": "unsloth/Qwen3.5-2B",
        "adapter_dir": HERE / "qwen35_2b_bp_lora",
        "val_file": HERE / "dataset_2b_val.jsonl",
        "results_file": HERE / "eval_2b_results.json",
    }


_DEFAULT_CONFIG = get_eval_config("2b")
ADAPTER_DIR = _DEFAULT_CONFIG["adapter_dir"]
BASE_MODEL = _DEFAULT_CONFIG["base_model"]
VAL_FILE = _DEFAULT_CONFIG["val_file"]
RESULTS_FILE = _DEFAULT_CONFIG["results_file"]
SEQ_LEN = 2048
MAX_NEW_TOKENS = 300
# T900978 P3 acceptance thresholds (full val split, --mode val, no --limit)
MIN_COMMAND_MATCH = 0.70
MAX_EMPTY_RATE = 0.0
MAX_THINK_LEAK_RATE = 0.0
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
    rows = [json.loads(l) for l in VAL_FILE.read_text().splitlines()]
    qs = [r["messages"][-2]["content"] for r in rows]
    refs = [r["messages"][-1]["content"] for r in rows]
    return (qs[:limit], refs[:limit]) if limit else (qs, refs)


def _extract_commands(text):
    return re.findall(r"```(?:bash|sh|shell)?\n(.*?)```", text, re.DOTALL)


def score_answer(answer, ref):
    """P3: pure scoring helper — returns dict(cmd_hit, empty, think_leak)."""
    think_leak = bool(re.search(r"<think>", answer))
    empty = not answer.strip()
    ref_cmds = " ".join(_extract_commands(ref))
    ref_tokens = [t for t in re.findall(r"(?:task|bash|systemctl|curl|git|python3?|node)\s+\S+",
                                        ref_cmds)]
    if ref_tokens:
        cmd_hit = any(tok.split()[-1].split(":")[0] in answer for tok in ref_tokens)
    else:
        cmd_hit = None
    return {"cmd_hit": cmd_hit, "empty": empty, "think_leak": think_leak}


def check_thresholds(command_match, empty_rate, leak_rate):
    """P3: acceptance gate — (passed: bool, summary: str)."""
    problems = []
    if command_match < MIN_COMMAND_MATCH:
        problems.append(f"command-match {command_match:.2f} < {MIN_COMMAND_MATCH:.2f}")
    if empty_rate > MAX_EMPTY_RATE:
        problems.append(f"empty-output-rate {empty_rate:.3f} > {MAX_EMPTY_RATE:.3f}")
    if leak_rate > MAX_THINK_LEAK_RATE:
        problems.append(f"think-leak-rate {leak_rate:.3f} > {MAX_THINK_LEAK_RATE:.3f}")
    if problems:
        return False, "FAIL: " + "; ".join(problems)
    return True, (f"PASS: command-match {command_match:.2f} >= {MIN_COMMAND_MATCH:.2f}, "
                  f"empty {empty_rate:.3f}, leak {leak_rate:.3f}")


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
    RESULTS_FILE.write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[eval] wrote {RESULTS_FILE}")


def run_val(model, tokenizer, limit):
    questions, refs = _val_questions(limit)
    hit, scored, total, empty_n, leak_n, rows = 0, 0, 0, 0, 0, []
    for q, ref in zip(questions, refs):
        answer = _generate(model, tokenizer, q)
        s = score_answer(answer, ref)
        ok = s["cmd_hit"]
        total += 1
        empty_n += 1 if s["empty"] else 0
        leak_n += 1 if s["think_leak"] else 0
        if ok is not None:
            scored += 1
            hit += 1 if ok else 0
        rows.append({"question": q, "reference": ref, "tuned": answer,
                     "cmd_hit": ok, "empty": s["empty"], "think_leak": s["think_leak"]})
        print(f"[val {total}] {'HIT' if ok else ('MISS' if ok is False else 'n/a')}: {q[:70]}")
    command_match = (hit / scored) if scored else 0.0
    empty_rate, leak_rate = empty_n / total, leak_n / total
    passed, summary = check_thresholds(command_match, empty_rate, leak_rate)
    print(f"\n[eval] command-match: {hit}/{scored} = {command_match:.3f} "
          f"(rough signal — reference commands appearing in the tuned answer)")
    print(f"[eval] empty-output-rate: {empty_rate:.3f}, think-leak-rate: {leak_rate:.3f}")
    print(f"[eval] {summary}")
    RESULTS_FILE.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[eval] wrote {RESULTS_FILE}")
    if not passed:
        sys.exit(2)


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
    global _bp_worker_style, ADAPTER_DIR, BASE_MODEL, VAL_FILE, RESULTS_FILE
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--mode", choices=["compare", "val", "interactive"], default="compare")
    ap.add_argument("--model-size", choices=["2b", "4b", "4b-mtp"], default="4b-mtp",
                    help="model size preset (default: 4b-mtp)")
    ap.add_argument("--limit", type=int, default=8, help="cap val questions (0 = all)")
    ap.add_argument("--adapter", type=Path, default=None)
    ap.add_argument("--base-model", type=str, default=None)
    ap.add_argument("--val-file", type=Path, default=None)
    ap.add_argument("--results-file", type=Path, default=None)
    ap.add_argument("--worker-style", action="store_true",
                    help="drop the BP system prompt (worker-style robustness check)")
    ap.add_argument("--dry-run", action="store_true",
                    help="validate configuration and dataset without loading models")
    ap.add_argument("--force", action="store_true", help="skip VRAM preflight")
    args = ap.parse_args()
    _bp_worker_style = args.worker_style

    cfg = get_eval_config(args.model_size)
    BASE_MODEL = args.base_model or cfg["base_model"]
    ADAPTER_DIR = args.adapter or cfg["adapter_dir"]
    VAL_FILE = args.val_file or cfg["val_file"]
    RESULTS_FILE = args.results_file or cfg["results_file"]

    if args.dry_run:
        if not VAL_FILE.is_file():
            print(f"[eval dry-run] ERROR: val file not found: {VAL_FILE}", file=sys.stderr)
            sys.exit(1)
        print(f"[eval dry-run] Config OK: base={BASE_MODEL}, adapter={ADAPTER_DIR.name}, "
              f"val={VAL_FILE.name}, results={RESULTS_FILE.name}, mode={args.mode}")
        return

    sys.path.insert(0, str(HERE))
    from train_5070ti import gpu_preflight
    if not args.force:
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
