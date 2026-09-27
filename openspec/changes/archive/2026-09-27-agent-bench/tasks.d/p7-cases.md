---
title: "p7 — Erste Fälle aus echten Begebenheiten"
ticket_id: T900561
domains: [llm-local-dev]
status: active
---

# p7 — Erste Fälle aus echten Begebenheiten

Files: `scripts/llm/agent-bench/cases/` (neu). Umfang dieses Changes: 4 Fälle, die zusammen alle fünf
Rollen und alle sechs Perspektiven abdecken; weitere Fälle folgen als reine Daten ohne Codeänderung.

## Task 7.1: Begebenheiten auswählen

Kandidaten aus Archiv und Bug-Tickets nach Vielfalt der Entscheidung (nicht nach Größe) wählen:

```bash
ls openspec/changes/archive | tail -200
bash scripts/ticket.sh list --type bug --status done --limit 50
```

Auswahlkriterien: offline prüfbar (kein Cluster, kein Netz), Diff ≤ 5 Dateien, eindeutig testbares
Ergebnis. Je Fall die Begebenheit in `source.md` schildern (was war die Anfrage, was war die richtige
Entscheidung, was ging schief) und in `case.json` `source_ref` setzen. Split: 2 Fälle `eval`, 2 Fälle
`train`, zugeordnet je Begebenheit.

## Task 7.2: Fälle anlegen

| Fall | Art | Perspektiven | Rollen |
|---|---|---|---|
| F1 | Fixture | `clean`, `ambiguous`, `detour-trap` | planner, orchestrator, code-worker |
| F2 | Fixture | `clean`, `faulty-worker`, `conflicting` | orchestrator, code-worker, reviewer |
| F3 | Fixture | `vision` (2 Varianten: Screenshot + Diagramm) | vision-worker |
| F4 | Replay eines archivierten Changes | `clean` | planner, orchestrator, code-worker, reviewer |

Je Variante: `brief.md`, `variant.json` (Budget aus einem Probelauf mit dem Teacher bzw. Referenzplan
geschätzt, im Feld `budget_source` begründet), `reference/` im Plan-Runner-Format, `checks/run.sh`
(Exit 0 = grün, nur offline). Reviewer-Varianten zusätzlich `checks/diffs/clean.diff`,
`checks/diffs/seeded-1.diff` + `seeded-1.json` (`{ file, line, defect }`). Vision-Varianten:
Bild + `checks/expected.json` (`fields`, `forbidden`); Screenshot aus einer Fixture-Seite erzeugen, keine
echten Personendaten.

## Task 7.3: Validierung

```bash
node -e "import('./scripts/llm/agent-bench/lib/cases.mjs').then(m=>{const r=m.validateCases('scripts/llm/agent-bench/cases');console.log(JSON.stringify(r));process.exit(r.ok?0:1)})"
for c in scripts/llm/agent-bench/cases/*/variants/*/checks/run.sh; do bash -n "$c"; done
```

Akzeptanz: Validierung `ok: true`; jede `checks/run.sh` ist gegen die Referenzlösung grün und gegen den
unveränderten Ausgangszustand rot (einmal manuell geprüft und in `source.md` vermerkt).
