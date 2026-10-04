"""U3: k candidate plans per prompt from the base model, plus one lint-guided repair.

Generation sees the plan-lint hard rules as a system prompt; the training prompt
does not (context distillation: the tuned model must follow the rules unprompted).
"""
from __future__ import annotations

import argparse
import itertools
import json
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from planner.common import DATA, append_jsonl, read_jsonl
from planner.llm import chat
from planner.verify import EXAMPLE, accept, lint, lint_errors, parse_candidate

SYSTEM = ("Du schreibst Implementierungspläne für das Bachelorprojekt-Repository. Antworte nur mit dem "
          "Plan als Markdown-Datei, ohne Codefence darum. Der Plan muss diese Regeln erfüllen:\n\n{rules}\n\n"
          "Ein Plan, der alle Regeln erfüllt (nur als Formatbeispiel, Inhalt nicht übernehmen):\n\n"
          "<beispiel>\n{example}\n</beispiel>")


def train_prompt(row: dict) -> str:
    return f"{row['prompt'].rstrip()}\n\nTicket-ID: {row['id']}\n"


def repair_message(errors: list[str], rules: str) -> str:
    listed = "\n".join(f"- {e}" for e in errors[:15])
    codes = {e.split(":", 1)[0] for e in errors}
    relevant = "\n".join(l for l in rules.splitlines() if l.split(":", 1)[0] in codes)
    return ("plan-lint meldet diese harten Fehler:\n" + listed + "\n\nDie verletzten Regeln:\n" + relevant +
            "\n\nBehebe jeden Fehler und gib den vollständigen, korrigierten Plan aus, nur den Plan.")


def check(parsed, args, example: str) -> tuple[bool, bool, str]:
    """(lint_ok, accepted, lint_output) for a parsed candidate."""
    if not parsed:
        return False, False, ""
    lint_ok, out = lint(parsed[1], args.repo)
    return lint_ok, accept(parsed[1], args.repo, example, lint_ok)[0], out


def run_prompt(row: dict, url: str, args, system: str, rules: str, lock: threading.Lock) -> dict:
    tp = train_prompt(row)
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": tp}]
    results = []
    for i in range(args.k):
        try:
            c = chat(url, msgs, think=True, max_tokens=args.max_tokens, temperature=0.8)[0]
        except Exception as e:  # server hiccup: record and continue
            c = {"content": "", "reasoning": "", "finish": f"error: {e}"}
        lint_ok, ok, out = check(parse_candidate(c), args, args.example)
        rec = {"id": row["id"], "train_prompt": tp, "attempt": 0, "sample": i, "lint_ok": lint_ok,
               "accepted": ok, "errors": lint_errors(out), **c}
        results.append(rec)
        with lock:
            append_jsonl(args.out, rec)
        if ok and args.stop_on_pass:
            return {"id": row["id"], "pass": True}
    if any(r["accepted"] for r in results):
        return {"id": row["id"], "pass": True}
    fixable = [r for r in results if parse_candidate(r) and r["errors"]]
    if not fixable or not args.repair:
        return {"id": row["id"], "pass": False}
    base = min(fixable, key=lambda r: len(r["errors"]))
    msgs2 = msgs + [{"role": "assistant", "content": parse_candidate(base)[1]},
                    {"role": "user", "content": repair_message(base["errors"], rules)}]
    try:
        c = chat(url, msgs2, think=True, max_tokens=args.max_tokens, temperature=0.6)[0]
    except Exception as e:
        c = {"content": "", "reasoning": "", "finish": f"error: {e}"}
    lint_ok, ok, out = check(parse_candidate(c), args, args.example)
    rec = {"id": row["id"], "train_prompt": tp, "attempt": 1, "sample": 0, "lint_ok": lint_ok,
           "accepted": ok, "errors": lint_errors(out), **c, "reasoning": ""}
    with lock:
        append_jsonl(args.out, rec)
    return {"id": row["id"], "pass": ok}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--prompts", default=f"{DATA / 'prompts_train.jsonl'},{DATA / 'prompts_history.jsonl'}",
                    help="kommagetrennte JSONL-Dateien mit id, prompt")
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--base-urls", default="http://127.0.0.1:19300",
                    help="kommagetrennt; jede URL bekommt --slots parallele Anfragen")
    ap.add_argument("--slots", type=int, default=2)
    ap.add_argument("--k", type=int, default=3)
    ap.add_argument("--max-tokens", type=int, default=8192)
    ap.add_argument("--no-repair", dest="repair", action="store_false")
    ap.add_argument("--stop-on-pass", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", type=Path, default=DATA / "candidates.jsonl")
    args = ap.parse_args(argv)

    rules = subprocess.run(["bash", str(args.repo / "scripts/plan-lint.sh"), "--rules"], cwd=args.repo,
                           capture_output=True, text=True, check=True).stdout
    args.example = (args.repo / EXAMPLE).read_text(encoding="utf-8")
    system = SYSTEM.format(rules=rules, example=args.example)
    done = {r["id"] for r in read_jsonl(args.out)}
    pool_rows = [r for f in args.prompts.split(",") if f for r in read_jsonl(Path(f))]
    todo = [r for r in pool_rows if r["id"] not in done]
    if args.limit:
        todo = todo[:args.limit]
    urls = [u.strip() for u in args.base_urls.split(",") if u.strip()]
    lanes = list(itertools.chain.from_iterable([u] * args.slots for u in urls))
    lock, passed, finished = threading.Lock(), 0, 0
    print(json.dumps({"todo": len(todo), "skipped_done": len(done), "lanes": len(lanes)}), flush=True)

    with ThreadPoolExecutor(len(lanes)) as pool:
        futures = [pool.submit(run_prompt, row, lanes[i % len(lanes)], args, system, rules, lock)
                   for i, row in enumerate(todo)]
        for f in futures:
            res = f.result()
            finished += 1
            passed += res["pass"]
            if finished % 10 == 0 or finished == len(todo):
                print(json.dumps({"finished": finished, "passed": passed,
                                  "pass_rate": round(passed / finished, 3)}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
