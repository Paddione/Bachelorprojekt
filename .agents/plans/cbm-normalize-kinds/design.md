# design.md — K1 post-index Kind-Normalisierung (Weg A1)

## Symptom (Fakt) vs. Ursache (Hypothese, belegt)

- **Symptome:** Nach jedem Full-Rebuild kehren Wildwuchs-Kinds zurueck
  (Okt: EnvVar 197 / Type 91 / DiagramElement 39 / Process 31;
  live am 02.11.2026 in `home-patrick-Bachelorprojekt.db`:
  EnvVar 1137, Type 485, DiagramElement 355, Process 57, Diagram 16,
  Decorator 11, Chart 3, View 2). Einmalige DB-Migration wird
  per Konstruktion gewipt.
- **Ursache (belegt, keine Hypothese mehr):** Der Indexer ist die
  geschlossene Binary `codebase-memory-mcp@0.12.1` (ELF, `dist/` leer,
  Kind-Vergabe in minifiziertem Bundle). Kein lokaler Source, keine
  Schreib-API (alle Lese-Tools `readOnlyHint:true`). Einziger
  Schreibpfad in unserer Hand: die Live-SQLite
  `~/.cache/codebase-memory-mcp/<projekt>.db` (Tabelle `nodes`,
  Spalte `label`).

## Fix-Ansatz

Deterministischer Post-Index-Hook in repo-eigenem Code:
`scripts/mcp/cbm-single-flight.sh` ruft nach erfolgreichem
`index_repository` den Normalizer auf. Jeder Rebuild normalisiert
erneut — rebuildfest per Konstruktion, ohne den Generator zu patchen.

## CLI-Vertrag `scripts/mcp/cbm-normalize-kinds.py`

- `python3 scripts/mcp/cbm-normalize-kinds.py --db PFAD [--project NAME] [--apply]`
- Default: Dry-Run (JSON-Bericht `{mapped, untouched}`, Exit 0, keine Schreibzugriffe).
- `--apply`: schreibt, idempotent (Zweitlauf meldet 0 Aenderungen).
- Stdlib-only (`sqlite3`, `argparse`, `json`) — keine neue Dependency,
  Konvention der `scripts/mcp/`-Wrapper.
- `UPDATE nodes SET label=? WHERE label=? [AND project=?]`, Counts pro Mapping.

## Taxonomie-Map (aus Goal-INVENTORY, vom User bestaetigt)

| Wild | Kern |
|---|---|
| EnvVar | Variable |
| Diagram, DiagramElement | Section |
| Process, Decorator | Function |
| Branch | File |
| Type | Class |

## Edge-Cases

- **FTS-Konsistenz:** `nodes_fts` ist contentless-FTS5 ohne Trigger,
  `label` dort bereits NULL — Normalizer fasst nur `nodes.label` an,
  kein FTS-Rebuild noetig (verifiziert 02.11.2026).
- **Branch-Rows** tragen Git-Properties, werden trotzdem gemappt
  (Taxonomie-Entscheid aus dem Goal, kein Informationsverlust:
  Properties bleiben unangetastet).
- **Daemon/WAL:** Schreiben via `sqlite3` gegen die Live-DB nutzt das
  normale Locking; Pilot laeuft erst Dry-Run, dann `--apply` mit
  ausgebauter ID-Liste im Log.
- **`.zst`-Flanke:** Die committed `.zst` bleibt bis zum naechsten
  Index-Lauf wild; K5-Receipts halten das fest (bewusst ausser Scope,
  kein zstd auf dem System, keine neue Dep).
