"""U1: planner prompts from the ticket DB, held-out split by whole areas."""
from __future__ import annotations

import argparse
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from planner.common import DATA, write_jsonl

FORMAT_HINTS = {
    "tasks-index": "einen tasks.md-Index mit `## Partials`-Manifest (min_tier, ctx_tokens, disjunkte "
                   "target_files, depends_on), `## File Structure` und finalem Verify-Task",
    "partial": "einen einzelnen Partial (tasks.d/pX-<name>.md) mit Frontmatter, Zielen, Schritten und "
               "eigenem Prüfbefehl",
    "openspec-legacy": "einen OpenSpec-Implementierungsplan (tasks.md) im älteren Format",
    "superpowers-legacy": "einen Superpowers-Implementierungsplan im älteren Format",
}


def build_prompt(title: str, description: str, fmt: str) -> str:
    hint = FORMAT_HINTS.get(fmt, fmt)
    return (
        "Du bist der Planner im Bachelorprojekt-Repository. Schreibe für den folgenden Auftrag "
        f"einen Implementierungsplan. Verlangtes Format: {fmt} — {hint}. "
        "Nenne exakte Pfade, Prüfbefehle und Abhängigkeiten.\n\n"
        f"# Auftrag: {title.strip()}\n\n{description.strip()}\n"
    )


def split_heldout(tickets: list[dict], heldout_areas: set[str]) -> tuple[list[dict], list[dict]]:
    train, heldout = [], []
    for t in tickets:
        areas = set(t.get("areas") or [])
        (heldout if areas & heldout_areas else train).append(t)
    return train, heldout


def _ticket_sh(repo: Path, *args: str) -> str:
    return subprocess.run(["bash", str(repo / "scripts/ticket.sh"), *args], cwd=repo,
                          capture_output=True, text=True, check=True).stdout


def fetch_tickets(repo: Path, workers: int = 8) -> list[dict]:
    rows = json.loads(_ticket_sh(repo, "list", "--limit", "5000"))

    def full(row: dict) -> dict:
        try:
            got = json.loads(_ticket_sh(repo, "get", "--id", row["external_id"]))
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            got = {}
        return {"id": row["external_id"], "title": got.get("title") or row.get("title") or "",
                "description": got.get("description") or "", "areas": row.get("areas") or [],
                "status": row.get("status"), "type": row.get("type")}

    with ThreadPoolExecutor(workers) as pool:
        return list(pool.map(full, rows))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--heldout-areas", required=True, help="kommagetrennt, z. B. security,website,ci")
    ap.add_argument("--out", type=Path, default=DATA)
    ap.add_argument("--min-desc-words", type=int, default=15)
    args = ap.parse_args(argv)

    tickets = fetch_tickets(args.repo)
    (args.out / "tickets.json").parent.mkdir(parents=True, exist_ok=True)
    (args.out / "tickets.json").write_text(json.dumps({t["id"]: t for t in tickets}, ensure_ascii=False))
    usable = [t for t in tickets if t["title"] and t["title"] != "undefined"
              and len(t["description"].split()) >= args.min_desc_words]
    train, heldout = split_heldout(usable, set(args.heldout_areas.split(",")))
    for name, part in (("prompts_train.jsonl", train), ("prompts_heldout.jsonl", heldout)):
        write_jsonl(args.out / name, [
            {"id": t["id"], "prompt": build_prompt(t["title"], t["description"], "tasks-index"),
             "areas": t["areas"]} for t in part])
    (args.out / "heldout_ids.txt").write_text(
        "\n".join(t["id"] for t in tickets if set(t["areas"]) & set(args.heldout_areas.split(","))))
    print(json.dumps({"tickets": len(tickets), "usable": len(usable),
                      "train": len(train), "heldout": len(heldout)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
