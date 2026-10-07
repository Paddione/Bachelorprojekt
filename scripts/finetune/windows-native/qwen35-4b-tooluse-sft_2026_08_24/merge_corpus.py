"""Merge teacher traces with the synthetic corpus into a training mix.

Input rows:
  teacher_traces_pool.jsonl : {"messages", "tools"?, "meta"} (collector output)
  tooluse_train.jsonl       : {"messages", "tools"}           (gen_dataset.py)

Output: tooluse_train_mixed.jsonl with rows {"messages", "tools"} — directly
loadable by train.py. Dedupe on message fingerprint, redaction re-applied,
teacher rows keep a "source" marker in meta-free form (train.py ignores
unknown keys via .get()).

Ratio control: --teacher-cap limits how often the same scenario template may
appear; --synthetic-keep keeps every Nth synthetic row (1 = all).
"""
import argparse
import hashlib
import json
import random
import re
from pathlib import Path

SECRET_PATTERNS = [
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    re.compile(r"(?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+"),
    re.compile(r"[A-Za-z0-9+/]{40,}={0,2}"),
]

def redact(text: str) -> str:
    out = text
    for p in SECRET_PATTERNS:
        out = p.sub("[REDACTED]", out)
    return out

def fp(row) -> str:
    return hashlib.sha256(json.dumps(row["messages"], sort_keys=True,
                                     ensure_ascii=False).encode()).hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", required=True)
    ap.add_argument("--synthetic", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=3407)
    args = ap.parse_args()
    random.seed(args.seed)

    rows, seen = [], set()

    # Teacher zuerst — Goldstandard hat Vorrang bei Duplikaten.
    t_kept = t_dup = 0
    for line in Path(args.teacher).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        e = json.loads(line)
        row = {"messages": e["messages"], "tools": e.get("tools"), "source": "teacher"}
        f = fp(row)
        if f in seen:
            t_dup += 1
            continue
        seen.add(f)
        rows.append(row)
        t_kept += 1

    s_kept = 0
    for line in Path(args.synthetic).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        e = json.loads(line)
        row = {"messages": e["messages"], "tools": e.get("tools"), "source": "synthetic"}
        f = fp(row)
        if f in seen:
            continue
        seen.add(f)
        rows.append(row)
        s_kept += 1

    random.shuffle(rows)

    # Redaction auf dem fertigen Serialisat.
    out_path = Path(args.out)
    with out_path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(redact(json.dumps(row, ensure_ascii=False)) + "\n")

    n_teacher = sum(1 for r in rows if r["source"] == "teacher")
    print(f"gemischt: {len(rows)} Zeilen ({n_teacher} teacher / {len(rows)-n_teacher} synthetic, "
          f"{t_dup} teacher-Duplikate verworfen) -> {out_path}")

if __name__ == "__main__":
    main()
