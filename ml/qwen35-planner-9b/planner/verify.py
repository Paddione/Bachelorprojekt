"""U4: keep only candidates that pass plan-lint, carry no secrets and are unique."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

from planner.common import DATA, make_sample, read_jsonl, text_hash, write_jsonl

MIN_PLAN_WORDS = 100
SECRET_RES = [re.compile(p) for p in (
    r"sk-[A-Za-z0-9]{20,}", r"ghp_[A-Za-z0-9]{30,}", r"AKIA[0-9A-Z]{16}",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"xox[bp]-[A-Za-z0-9-]{10,}")]
FENCE = re.compile(r"^```[a-zA-Z]*\n(.*)\n```\s*$", re.S)
PATH_TOKEN = re.compile(r"`([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.*{},-]+)+/?)`")
MIN_GROUNDING = 0.6
MAX_COPY = 0.2
EXAMPLE = ".agents/plans/k3-health-monitoring/tasks.md"


def parse_candidate(c: dict) -> tuple[str, str] | None:
    plan = (c.get("content") or "").strip()
    m = FENCE.match(plan)
    if m:
        plan = m.group(1).strip()
    if not plan or "<think>" in plan or "</think>" in plan:
        return None
    if len(plan.split()) < MIN_PLAN_WORDS:
        return None
    return (c.get("reasoning") or "").strip(), plan


def has_secret(text: str) -> bool:
    return any(r.search(text) for r in SECRET_RES)


def grounding(plan: str, repo: Path) -> tuple[int, int]:
    """(grounded, total) over backticked repo paths: a path counts when it or its parent exists."""
    paths = {p.rstrip("/") for p in PATH_TOKEN.findall(plan) if "*" not in p and "{" not in p}
    paths = {p for p in paths if not p.startswith(("http", "~", "/"))}
    hit = sum((repo / p).exists() or (repo / p).parent.is_dir() for p in paths)
    return hit, len(paths)


def _shingles(text: str, n: int = 8) -> set[str]:
    w = text.split()
    return {" ".join(w[i:i + n]) for i in range(max(0, len(w) - n + 1))}


def copy_ratio(candidate: str, reference: str) -> float:
    c = _shingles(candidate)
    return len(c & _shingles(reference)) / len(c) if c else 0.0


def lint(plan: str, repo: Path) -> tuple[bool, str]:
    with tempfile.TemporaryDirectory(prefix="planlint-") as d:
        f = Path(d) / "tasks.md"
        f.write_text(plan, encoding="utf-8")
        p = subprocess.run(["bash", str(repo / "scripts/plan-lint.sh"), str(f)], cwd=repo,
                           capture_output=True, text=True, timeout=300)
    out = p.stdout + p.stderr
    return p.returncode == 0 and "PLAN-LINT: PASS" in out, out


def accept(plan: str, repo: Path, example: str, lint_ok: bool | None = None) -> tuple[bool, str]:
    """Full RFT acceptance: lint PASS, not copied from the example, grounded in real paths."""
    if lint_ok is None:
        lint_ok = lint(plan, repo)[0]
    if not lint_ok:
        return False, "lint_fail"
    if copy_ratio(plan, example) > MAX_COPY:
        return False, "copied"
    hit, total = grounding(plan, repo)
    if total == 0 or hit / total < MIN_GROUNDING:
        return False, "ungrounded"
    return True, "pass"


def lint_errors(out: str) -> list[str]:
    return [l.lstrip("✗ ").strip() for l in out.splitlines() if l.startswith("✗")]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--candidates", type=Path, default=DATA / "candidates.jsonl")
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=DATA / "rft.jsonl")
    args = ap.parse_args(argv)

    best: dict[str, dict] = {}
    example = (args.repo / EXAMPLE).read_text(encoding="utf-8")
    seen, stats = set(), {"candidates": 0, "parsed": 0, "secret": 0, "lint_fail": 0, "copied": 0,
                          "ungrounded": 0, "pass": 0, "dupes": 0}
    for row in read_jsonl(args.candidates):
        stats["candidates"] += 1
        parsed = parse_candidate(row)
        if parsed is None:
            continue
        stats["parsed"] += 1
        reasoning, plan = parsed
        if has_secret(plan + reasoning):
            stats["secret"] += 1
            continue
        ok, reason = accept(plan, args.repo, example, row.get("lint_ok"))
        stats[reason] += 1
        if not ok:
            continue
        h = text_hash(plan)
        if h in seen:
            stats["dupes"] += 1
            continue
        seen.add(h)
        prev = best.get(row["id"])
        if prev is None or len(plan) < len(prev["plan"]):
            best[row["id"]] = {"plan": plan, "reasoning": reasoning, "row": row}

    rows = [make_sample(b["row"]["train_prompt"], b["plan"], think=b["reasoning"] or None, source="rft",
                        meta={"id": pid, "attempt": b["row"].get("attempt", 0)})
            for pid, b in best.items()]
    stats["kept"] = write_jsonl(args.out, rows)
    stats["prompts_with_pass"] = len(best)
    print(json.dumps(stats))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
