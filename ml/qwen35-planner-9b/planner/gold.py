"""U2: gold (request -> plan) pairs from every plan file in the git history."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

from planner.common import DATA, make_sample, text_hash, write_jsonl
from planner.prompts import build_prompt

PATHSPECS = [
    ".agents/plans/*/tasks.md", ".agents/plans/*/tasks.d/*.md",
    "openspec/changes/*/tasks.md", "openspec/changes/*/tasks.d/*.md",
    "docs/superpowers/plans/*.md",
]
STRUCTURE = re.compile(
    r"^(#{2,3} (File Structure|File Map|Partials|Tasks|Steps|Aufgaben|Global Constraints|Review Focus|"
    r"Schritte|Task\b)|### Task\b)", re.M)
TICKET = re.compile(r"\bT\d{6}\b")
MIN_INTRO_WORDS = 15
MIN_TARGET_WORDS, MAX_TARGET_WORDS = 200, 12000
MAX_COMPANION_WORDS = 1500


def classify(path: str) -> str:
    if "/tasks.d/" in path:
        return "partial"
    if path.startswith("openspec/"):
        return "openspec-legacy"
    if path.startswith("docs/superpowers/"):
        return "superpowers-legacy"
    return "tasks-index"


def strip_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            return text[end + 4:].lstrip("\n")
    return text


def split_goal(text: str) -> tuple[str, str] | None:
    body = strip_frontmatter(text)
    m = STRUCTURE.search(body)
    if not m:
        return None
    intro, target = body[:m.start()].strip(), body[m.start():].strip()
    if len(intro.split()) < MIN_INTRO_WORDS:
        return None
    return intro, target


def ticket_ids(text: str) -> set[str]:
    return set(TICKET.findall(text))


def keep_plan(ids: set[str], heldout: set[str]) -> bool:
    return not (ids & heldout)


def companion_paths(path: str, text: str) -> list[str]:
    parent = path.rsplit("/", 1)[0]
    if "/tasks.d/" in path:
        return [path.split("/tasks.d/")[0] + "/tasks.md"]
    if path.startswith("openspec/"):
        return [f"{parent}/proposal.md", f"{parent}/design.md"]
    if path.startswith("docs/superpowers/"):
        m = re.search(r"(?:spec_ref:|\*\*Spec:\*\*|^Spec:)\s*`?([\w./-]+\.md)", text, re.M)
        return [m.group(1)] if m else []
    return []


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True).stdout


def latest_versions(repo: Path) -> dict[str, str]:
    """path -> sha of its newest added/modified version across all refs."""
    out = _git(repo, "log", "--all", "--format=%H", "--name-only", "--diff-filter=AM", "--", *PATHSPECS)
    latest, sha = {}, None
    for line in out.splitlines():
        line = line.strip()
        if re.fullmatch(r"[0-9a-f]{40}", line):
            sha = line
        elif line and line not in latest:
            latest[line] = sha
    return latest


def _clip(text: str, words: int) -> str:
    parts = text.split()
    return text if len(parts) <= words else " ".join(parts[:words]) + " …"


def build_pair(path: str, sha: str, text: str, tickets: dict, show) -> dict | None:
    fmt = classify(path)
    ids = ticket_ids(text + " " + path)
    goal = split_goal(text)
    target = goal[1] if goal else strip_frontmatter(text).strip()
    title = next((l.lstrip("# ").strip() for l in strip_frontmatter(text).splitlines() if l.startswith("# ")), path)

    ticket = next((tickets[i] for i in sorted(ids) if i in tickets and tickets[i].get("description")), None)
    if ticket:
        request, origin = ticket["description"], "ticket"
        title = ticket.get("title") or title
    else:
        companion = next((c for c in (show(sha, p) for p in companion_paths(path, text)) if c.strip()), "")
        if companion:
            request, origin = _clip(strip_frontmatter(companion), MAX_COMPANION_WORDS), "companion"
        elif goal:
            request, origin = goal[0], "intro"
        else:
            return None
    n = len(target.split())
    if not (MIN_TARGET_WORDS <= n <= MAX_TARGET_WORDS):
        return None
    return make_sample(build_prompt(title, request, fmt), target, think=None, source="gold",
                       meta={"path": path, "sha": sha, "format": fmt, "origin": origin,
                             "ticket_ids": sorted(ids)})


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--tickets", type=Path, default=DATA / "tickets.json")
    ap.add_argument("--heldout", type=Path, default=DATA / "heldout_ids.txt")
    ap.add_argument("--out", type=Path, default=DATA / "gold.jsonl")
    args = ap.parse_args(argv)

    tickets = json.loads(args.tickets.read_text()) if args.tickets.is_file() else {}
    heldout = set(args.heldout.read_text().split()) if args.heldout.is_file() else set()

    def show(sha: str, p: str) -> str:
        return _git(args.repo, "show", f"{sha}:{p}")

    rows, seen, stats = [], set(), {"files": 0, "heldout": 0, "dropped": 0, "dupes": 0}
    for path, sha in latest_versions(args.repo).items():
        stats["files"] += 1
        text = show(sha, path)
        if not keep_plan(ticket_ids(text + " " + path), heldout):
            stats["heldout"] += 1
            continue
        pair = build_pair(path, sha, text, tickets, show)
        if pair is None:
            stats["dropped"] += 1
            continue
        h = text_hash(pair["messages"][1]["content"])
        if h in seen:
            stats["dupes"] += 1
            continue
        seen.add(h)
        rows.append(pair)
    stats["kept"] = write_jsonl(args.out, rows)
    for key in ("origin", "format"):
        stats[key] = {}
        for r in rows:
            stats[key][r["meta"][key]] = stats[key].get(r["meta"][key], 0) + 1
    print(json.dumps(stats))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
