"""U9: gates G1-G3, base vs tuned, both served as Q4_K_M GGUF with identical flags.

G1  planner: accept() rate (lint + grounding + no copy) on held-out tickets, think on, no rules prompt
G2a IFEval (lm-eval, non-think server)   G2b MMLU-Pro 500 (think)   G2c ChartQA 500 (non-think)
G3  MTP decode throughput via ml/qwen35-agents/eval/mtp_bench.py
"""
from __future__ import annotations

import argparse
import contextlib
import json
import os
import random
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from planner.common import DATA, OUT, read_jsonl
from planner.llm import chat
from planner.verify import EXAMPLE, accept, parse_candidate

SERVER = Path.home() / "opt/llama-current/bin/llama-server"
PORT = 19310
SEED = 7
N_SAMPLE = 500
LETTERS = "ABCDEFGHIJ"


def relaxed_match(pred: str, gold: str) -> bool:
    num = re.compile(r"-?\d+(?:\.\d+)?")
    g = gold.strip().rstrip("%")
    try:
        gv = float(g)
    except ValueError:
        norm = lambda s: re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()
        return norm(pred) == norm(gold)
    found = num.findall(pred.replace(",", ""))
    if not found:
        return False
    pv = float(found[-1])
    return abs(pv - gv) <= 0.05 * abs(gv) if gv else pv == 0


def extract_choice(text: str) -> str | None:
    hits = re.findall(r"answer is \(?([A-J])\)?|Answer:\s*\(?([A-J])\)?", text)
    if not hits:
        return None
    last = hits[-1]
    return last[0] or last[1]


def mmlu_prompt(question: str, options: list[str]) -> str:
    opts = "\n".join(f"{LETTERS[i]}. {o}" for i, o in enumerate(options))
    return (f"{question}\n\n{opts}\n\nThink step by step, then finish with "
            "\"the answer is (X)\" where X is the letter.")


def gate(base: dict, tuned: dict) -> dict:
    def ge(key, delta):
        return key in base and key in tuned and tuned[key] >= base[key] + delta
    return {
        "G1": ge("g1", 0.10),
        "G2a": ge("ifeval", -0.02),
        "G2b": ge("mmlu_pro", -0.02),
        "G2c": ge("chartqa", -0.02),
        "G3": "tok_s" in base and "tok_s" in tuned and tuned["tok_s"] >= 0.95 * base["tok_s"],
    }


@contextlib.contextmanager
def serve(gguf_dir: Path, reasoning: str):
    model = next(gguf_dir.glob("*-Q4_K_M.gguf"))
    mmproj = next(gguf_dir.glob("mmproj-*.gguf"))
    env = {**os.environ, "CUDA_DEVICE_ORDER": "PCI_BUS_ID", "CUDA_VISIBLE_DEVICES": "1"}
    cmd = [str(SERVER), "-m", str(model), "--mmproj", str(mmproj), "-ngl", "999", "-c", "65536",
           "-np", "4", "--port", str(PORT), "--host", "127.0.0.1", "--jinja", "-fa", "on",
           "--reasoning", reasoning, "--reasoning-budget", "3072"]
    (OUT / "logs").mkdir(parents=True, exist_ok=True)
    log = open(OUT / "logs" / f"eval-{gguf_dir.name}.log", "a")
    proc = subprocess.Popen(cmd, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        for _ in range(180):
            with contextlib.suppress(requests.RequestException):
                if requests.get(f"http://127.0.0.1:{PORT}/health", timeout=2).ok:
                    break
            time.sleep(2)
        else:
            raise RuntimeError("eval server did not become healthy")
        yield f"http://127.0.0.1:{PORT}"
    finally:
        proc.terminate()
        proc.wait(timeout=60)


def pmap(fn, items, workers=4):
    with ThreadPoolExecutor(workers) as pool:
        return list(pool.map(fn, items))


def run_g1(url: str, repo: Path, limit: int) -> float:
    rows = read_jsonl(DATA / "prompts_heldout.jsonl")[: limit or None]
    example = (repo / EXAMPLE).read_text(encoding="utf-8")

    def one(r):
        c = chat(url, [{"role": "user", "content": f"{r['prompt'].rstrip()}\n\nTicket-ID: {r['id']}\n"}],
                 think=True, max_tokens=8192, temperature=0.6)[0]
        parsed = parse_candidate(c)
        return bool(parsed) and accept(parsed[1], repo, example)[0]
    return sum(pmap(one, rows)) / len(rows)


def _sample(ds, n: int):
    idx = list(range(len(ds)))
    random.Random(SEED).shuffle(idx)
    return [ds[i] for i in idx[:n]]


def run_mmlu(url: str, limit: int) -> float:
    from datasets import load_dataset
    rows = _sample(load_dataset("TIGER-Lab/MMLU-Pro", split="test"), limit or N_SAMPLE)

    def one(r):
        c = chat(url, [{"role": "user", "content": mmlu_prompt(r["question"], r["options"])}],
                 think=True, max_tokens=6144, temperature=0.6)[0]
        return extract_choice(c["content"]) == r["answer"]
    return sum(pmap(one, rows)) / len(rows)


def run_chartqa(url: str, limit: int) -> float:
    from datasets import load_dataset
    rows = _sample(load_dataset("HuggingFaceM4/ChartQA", split="test"), limit or N_SAMPLE)
    img_dir = OUT / "eval-images"
    img_dir.mkdir(parents=True, exist_ok=True)

    def one(i_r):
        i, r = i_r
        path = img_dir / f"chartqa-{i}.png"
        if not path.is_file():
            r["image"].convert("RGB").save(path)
        q = f"{r['query']}\nAnswer with a single word or number."
        c = chat(url, [{"role": "user", "content": [{"type": "image", "image": str(path)},
                                                    {"type": "text", "text": q}]}],
                 think=False, max_tokens=64, temperature=0.0)[0]
        gold = r["label"][0] if isinstance(r["label"], list) else r["label"]
        return relaxed_match(c["content"], str(gold))
    return sum(pmap(one, list(enumerate(rows)))) / len(rows)


def run_ifeval(url: str, limit: int, label: str) -> float:
    out = OUT / f"ifeval-{label}"
    cmd = ["uvx", "--from", "lm-eval[ifeval,api]", "lm_eval", "--model", "local-chat-completions",
           "--model_args", f"base_url={url}/v1/chat/completions,model=local,num_concurrent=4,max_gen_toks=2048",
           "--tasks", "ifeval", "--apply_chat_template", "--output_path", str(out)]
    if limit:
        cmd += ["--limit", str(limit)]
    subprocess.run(cmd, check=True)
    res = json.loads(next(out.rglob("results_*.json")).read_text())
    return res["results"]["ifeval"]["prompt_level_strict_acc,none"]


def run_g3(gguf_dir: Path, label: str, repo: Path) -> float:
    model = next(gguf_dir.glob("*-Q4_K_M.gguf"))
    report = OUT / f"mtp-{label}.json"
    subprocess.run(["python3", str(repo / "ml/qwen35-agents/eval/mtp_bench.py"), "--gguf", str(model),
                    "--label", label, "--ngl", "999", "--out", str(report),
                    "--extra-args", "--spec-type draft-mtp --spec-draft-n-max 4"],
                   check=True, env={**os.environ, "CUDA_DEVICE_ORDER": "PCI_BUS_ID", "CUDA_VISIBLE_DEVICES": "1"})
    return json.loads(report.read_text())["tok_s_median"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gguf", type=Path, help="dir with *-Q4_K_M.gguf + mmproj-*.gguf")
    ap.add_argument("--label", choices=["base", "tuned"])
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--suite", default="g1,g2a,g2b,g2c,g3")
    ap.add_argument("--limit", type=int, default=0, help="smoke: cap every suite")
    ap.add_argument("--compare", action="store_true", help="read out/eval_{base,tuned}.json, print gates")
    args = ap.parse_args(argv)

    if args.compare:
        b = json.loads((OUT / "eval_base.json").read_text())
        t = json.loads((OUT / "eval_tuned.json").read_text())
        print(json.dumps({"base": b, "tuned": t, "gates": gate(b, t)}, indent=2))
        return 0

    path = OUT / f"eval_{args.label}.json"
    res = json.loads(path.read_text()) if path.is_file() else {}
    suites = set(args.suite.split(","))
    commit = subprocess.run(["git", "-C", str(args.repo), "rev-parse", "HEAD"],
                            capture_output=True, text=True).stdout.strip()
    if suites & {"g1", "g2b"}:
        with serve(args.gguf, "on") as url:
            if "g1" in suites:
                res["g1"] = run_g1(url, args.repo, args.limit)
            if "g2b" in suites:
                res["mmlu_pro"] = run_mmlu(url, args.limit)
    if suites & {"g2a", "g2c"}:
        with serve(args.gguf, "off") as url:
            if "g2a" in suites:
                res["ifeval"] = run_ifeval(url, args.limit, args.label)
            if "g2c" in suites:
                res["chartqa"] = run_chartqa(url, args.limit)
    if "g3" in suites:
        res["tok_s"] = run_g3(args.gguf, args.label, args.repo)
    res["_meta"] = {"commit": commit, "gguf": str(args.gguf), "limit": args.limit,
                    "command": "python -m planner.evaluate " + " ".join(argv or [])}
    path.write_text(json.dumps(res, indent=2))
    print(json.dumps(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
