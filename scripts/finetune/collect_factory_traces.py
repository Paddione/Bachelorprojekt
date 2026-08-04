#!/usr/bin/env python3
"""scripts/finetune/collect_factory_traces.py — Factory-Laeufe zu Trainingskorpus rendern.

Liest abgeschlossene Ticket-Laeufe aus `tickets.factory_phase_events` und rendert sie ins
Korpusformat, das measure_corpus.py/train.py erwarten (JSONL, `{"messages": [...]}`).
Lesend ueber den MCP-Pfad gemaess .claude/skills/references/mcp-tool-guide.md
(`mcp__mcp-postgres__query`, READ-ONLY) — dieses Skript stellt selbst keine DB-Verbindung
her, sondern erwartet die bereits abgerufenen Zeilen entweder ueber `--fixture` (Tests, siehe
tests/spec/unsloth-training-env/factory-traces.bats) oder ueber `--rows-json` (Ergebnis eines
vorgeschalteten mcp-postgres-Aufrufs, z.B. per `mcp__mcp-postgres__query` und Umleitung des
JSON-Ergebnisses in eine Datei). Es gibt bewusst keinen eingebauten `psql`/DB-Connect-Pfad in
diesem Skript — Schreib-/Leseverbindungen zur Ticket-DB laufen ueber die sanktionierten Wege
(ticket-mcp / mcp-postgres), nicht ueber ein Trainings-Hilfsskript.

Zeilenform (--fixture / --rows-json), je Phase-Event eine Zeile:
    {
      "ticket_id": <int>, "external_id": "T...", "title": "...",
      "phase": "...", "state": "...", "detail": "...", "at": "ISO-8601"
    }

Filter und Schutz:

  - Nur Laeufe, deren Ergebnis als erfolgreich verzeichnet ist: mindestens ein Event mit
    phase == 'verify' und state == 'pass' (die dokumentierte Konvention fuer
    Quality-Gate-Ergebnisse, siehe CLAUDE.md "Merge = Abschluss"). Faellt dieses Event nicht
    vor, wird das Ticket komplett ausgeschlossen — Fehlverhalten einzuueben waere das
    Gegenteil des Trainingsziels.
  - Kein Lesezugriff auf environments/.secrets/ (dieses Skript liest ausschliesslich die
    uebergebenen Zeilen). Ein Redaktionsfilter entfernt bekannte Secret-Muster aus jedem
    `detail`-Feld, bevor geschrieben wird.
  - Ausgabeformat identisch zum externen Korpus, damit dieselbe Encode-Strecke greift.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

# Bekannte Secret-Muster (Teilmenge der ueblichen Token-Praefixe/-Formen). Bewusst
# konservativ (lieber ein Falsch-Positiv redigieren als ein Secret durchlassen).
SECRET_PATTERNS = [
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),       # GitHub PAT/OAuth/App-Token
    re.compile(r"sk-[A-Za-z0-9]{20,}"),                # OpenAI-artige API-Keys
    re.compile(r"AKIA[0-9A-Z]{16}"),                   # AWS Access Key ID
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),  # JWT
    re.compile(r"(?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+"),
    re.compile(r"[A-Za-z0-9+/]{40,}={0,2}"),           # lange Base64-Bloecke (Zertifikate/Keys)
]


def redact(text: str) -> str:
    out = text
    for pattern in SECRET_PATTERNS:
        out = pattern.sub("[REDACTED]", out)
    return out


def _load_rows(args: argparse.Namespace) -> list[dict]:
    if args.fixture:
        return json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    if args.rows_json:
        return json.loads(Path(args.rows_json).read_text(encoding="utf-8"))
    raise SystemExit(
        "FEHLER: weder --fixture noch --rows-json angegeben. Dieses Skript stellt selbst "
        "keine DB-Verbindung her — Zeilen kommen aus einem vorgeschalteten "
        "mcp-postgres-Aufruf (siehe Docstring)."
    )


def group_by_ticket(rows: list[dict]) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[row["ticket_id"]].append(row)
    for ticket_id in grouped:
        grouped[ticket_id].sort(key=lambda r: r.get("at", ""))
    return grouped


def is_successful(events: list[dict]) -> bool:
    return any(e.get("phase") == "verify" and e.get("state") == "pass" for e in events)


def render_conversation(events: list[dict]) -> dict:
    title = events[0].get("title", "")
    lines = []
    for e in events:
        detail = redact(str(e.get("detail") or ""))
        lines.append(f"{e['phase']}/{e['state']}: {detail}".strip(": "))
    assistant_content = "\n".join(lines)
    return {
        "messages": [
            {
                "role": "system",
                "content": (
                    "Du bist der Bachelorprojekt Software-Factory-Treiber. Setze das "
                    "Ticket wie im dokumentierten Verlauf beschrieben um."
                ),
            },
            {"role": "user", "content": redact(title)},
            {"role": "assistant", "content": assistant_content},
        ]
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fixture", help="JSON-Datei mit bereits abgerufenen Phase-Event-Zeilen (Tests)")
    parser.add_argument("--rows-json", help="JSON-Datei mit Phase-Event-Zeilen aus einem vorgeschalteten mcp-postgres-Aufruf")
    parser.add_argument("--out", required=True, help="Zielpfad der JSONL-Korpusdatei")
    args = parser.parse_args(argv)

    rows = _load_rows(args)
    grouped = group_by_ticket(rows)

    kept = 0
    skipped = 0
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        for ticket_id, events in grouped.items():
            if not is_successful(events):
                skipped += 1
                continue
            conversation = render_conversation(events)
            fh.write(json.dumps(conversation, ensure_ascii=False) + "\n")
            kept += 1

    print(f"Korpus geschrieben: {out_path} ({kept} erfolgreiche Laeufe, {skipped} uebersprungen).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
