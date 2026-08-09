---
title: "brain-ingest-chunking — Implementation Plan"
ticket_id: T002679
domains: [bachelorprojekt-infra, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-ingest-chunking — Implementation Plan

_Ticket: T002679 · Proposal: `openspec/changes/brain-ingest-chunking/proposal.md` ·
Design: `openspec/changes/brain-ingest-chunking/design.md`_

Gemessene Ausgangslage (2026-08-09, reproduziert):
`sources=144 total_chars=2446682 over_4000=81 sent=433395 coverage=17%`.

## File Structure

```
scripts/brain-chunk.sh                                   (neu)  Sektions-Chunker + Eltern-MOC aus TSV
scripts/brain-ingest-transform.sh                        (geändert) MAX_SOURCE_CHARS fail-closed
scripts/brain-ingest.sh                                  (geändert) chunk-aware Phase 2, MOC-Einbindung, Coverage-Gate-Aufruf
scripts/brain-ingest-coverage.sh                         (neu)  Coverage-Berechnung + Schwellen-Gate
scripts/brain-mcp-server.py                              (ersetzt) stdio-MCP-Server, BM25
docs/agent-guide/registry/mcp.yaml                       (geändert) brain-mcp Registry-Eintrag (SSOT)
.mcp.json                                                (generiert) task mcp:sync
.opencode/opencode.jsonc                                 (generiert) task mcp:sync
scripts/llm/mcp-servers.json                             (generiert) task mcp:sync
scripts/llm/loadouts.json                                (geändert) Ingest-Loadout
taskfiles/Taskfile.brain.yaml                            (geändert) brain:chunk, brain:mcp
tests/spec/brain-k4-brain-wiki/chunking.bats             (neu)
tests/spec/brain-k4-brain-wiki/max-source-chars-guard.bats (neu)
tests/spec/brain-k4-brain-wiki/parent-moc.bats           (neu)
tests/spec/brain-k4-brain-wiki/coverage-gate.bats        (neu)
tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats     (neu)
tests/spec/brain-k4-brain-wiki/mcp-registry.bats         (neu)
tests/spec/brain-mcp.bats                                (entfernt) prüft die abgelöste argparse-CLI
website/src/data/test-inventory.json                     (generiert) task test:inventory
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-chunker.md` | impl | `scripts/brain-chunk.sh`, `scripts/brain-ingest-transform.sh` | |
| p2 | `tasks.d/p2-pipeline.md` | impl | `scripts/brain-ingest.sh`, `scripts/brain-ingest-coverage.sh` | p1 |
| p3 | `tasks.d/p3-retrieval.md` | impl | `scripts/brain-mcp-server.py`, `docs/agent-guide/registry/mcp.yaml`, `.mcp.json`, `.opencode/opencode.jsonc`, `scripts/llm/mcp-servers.json`, `scripts/llm/loadouts.json`, `taskfiles/Taskfile.brain.yaml` | |
| p4 | `tasks.d/p4-tests.md` | tests | `tests/spec/brain-k4-brain-wiki/chunking.bats`, `tests/spec/brain-k4-brain-wiki/max-source-chars-guard.bats`, `tests/spec/brain-k4-brain-wiki/parent-moc.bats`, `tests/spec/brain-k4-brain-wiki/coverage-gate.bats`, `tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats`, `tests/spec/brain-k4-brain-wiki/mcp-registry.bats`, `tests/spec/brain-mcp.bats`, `website/src/data/test-inventory.json` | p1, p2, p3 |

`p4` trägt den Failing-Test-Step (STRUCT2) und wird zuerst rot geschrieben.

## S1-Budgets (wirksame Schwelle: Baseline falls gebaselined, sonst Extension-Limit)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/brain-chunk.sh` | 0 | 800 |
| `scripts/brain-ingest-coverage.sh` | 0 | 800 |
| `scripts/brain-ingest-transform.sh` | 175 | 625 |
| `scripts/brain-ingest.sh` | 540 | 260 |
| `scripts/brain-mcp-server.py` | 45 | 755 |

Keine der Dateien ist gebaselined; die wirksame Schwelle ist das Extension-Limit
(`.sh` 800, `.py` 800, siehe `docs/code-quality/gates.yaml`). `.yaml`, `.json`,
`.jsonc` und `.bats` tragen kein S1-Limit.

`scripts/brain-ingest.sh` ist mit Budget 260 die einzige enge Datei: 540 von 800
sind belegt, und 640 Zeilen wären bereits 80 % der Schwelle. Deshalb wird die
Coverage-Berechnung als eigenes Skript `scripts/brain-ingest-coverage.sh`
extrahiert statt in die Pipeline eingebaut, und die Eltern-MOC-Erzeugung liegt in
`scripts/brain-chunk.sh` — `brain-ingest.sh` ruft beide nur auf. Wächst die Datei
im Zuge der Umsetzung dennoch über 640 Zeilen, wird die Phase-2b-MOC-Sektion
(heute `:290-410`) in ein weiteres Skript ausgelagert, statt Zeilen kosmetisch
zusammenzuziehen.

## Verify (final)

- [x] **Alle Partial-Tasks abgeschlossen**, `p4` grün.

- [x] **Chunker gegen den realen Korpus laufen lassen** — kein LLM nötig, rein
      deterministisch. Erwartung: deutlich mehr Chunks als Quellen, keine Quelle
      ohne Chunk:

```bash
bash scripts/brain-ingest-worklist.sh --root . --manifest scripts/brain/ingest-sources.yaml > /tmp/wl.tsv
out=$(mktemp -d); n=0
while IFS=$'\t' read -r p s g; do
  n=$(( n + $(bash scripts/brain-chunk.sh --source "$p" --slug "$s" --out-dir "$out" | wc -l) ))
done < /tmp/wl.tsv
echo "sources=$(wc -l < /tmp/wl.tsv) chunks=$n"
# Anker: beide Zahlen müssen > 0 sein; chunks muss deutlich über sources liegen (~300 erwartet)
```

- [x] **Coverage-Gate misst über 95 %** gegen dieselbe Worklist:

```bash
bash scripts/brain-ingest-coverage.sh --worklist /tmp/wl.tsv --chunk-dir "$out"
# expected: exit 0 und eine gemeldete Abdeckung >= 95 %
```

- [x] **MCP-Registry ist driftfrei:**

```bash
task mcp:check
```

- [x] **Vollständige Testabdeckung dieses Vorgangs:**

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/brain-k4-brain-wiki
```

- [x] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Ergebnis der Verifikation (2026-08-09)

Gemessen im Worktree, nicht geschätzt:

```
sources=144 chunks=404
Coverage: 100% (Schwelle 95%, 2446787 von 2446682 Zeichen, 144 versuchte Quellen)
```

Ausgangslage war `sources=144 total_chars=2446682 over_4000=81 sent=433395 coverage=17%`.
Der Zähler liegt 105 Zeichen über dem Nenner, weil der Chunker eine fehlende
Schluss-Zeilenschaltung ergänzt — Vollständigkeit, kein Mehrinhalt.

`tests/unit/lib/bats-core/bin/bats -r tests/spec/brain-k4-brain-wiki*` → 23/23 grün.

### Abweichungen vom Plan (bewusst, mit Begründung)

- **Die Eltern-MOC steht NICHT im TSV des Chunkers.** `p2-pipeline.md` nahm an,
  sie erscheine als Manifestzeile. Das kann nicht stimmen: die MOC verlinkt
  genau die Chunks, eine Manifestzeile für sie selbst widerspräche also ihrer
  eigenen Wikilink-Menge — `parent-moc.bats` prüft beide Mengen auf Gleichheit.
  `brain-chunk.sh` schreibt die Datei nach `--moc`, und `brain-ingest.sh` hängt
  die Index-0-Zeile selbst an; den Pfad kennt es, es hat ihn übergeben.
- **Die MOC entsteht auch bei genau einem Chunk**, statt erst ab zwei. Der Plan
  wollte es umgekehrt; `parent-moc.bats` verlangt die Datei aber für eine
  Fixture, die einchunkig bleibt. Die Unterdrückung liegt jetzt eine Ebene
  höher: `brain-ingest.sh` nimmt die MOC nur ins Manifest auf, wenn die Quelle
  wirklich zerfallen ist.
- **`MAX_SOURCE_CHARS` wird von `brain-ingest.sh` auf das Doppelte der
  Chunk-Zielgröße gesetzt.** Der Stock-Default 4000 liegt UNTER der Zielgröße
  8000 — fail-closed hätte sonst ab p1 jeden erzeugten Chunk abgewiesen.
- **Phase 2a räumt nur noch Quellen auf, die im aktuellen Manifest stehen.** Die
  Fassung aus dem abgebrochenen Lauf löschte jeden State-Eintrag, dessen Quelle
  nicht im Manifest vorkam — unter `--pilot` ist das Manifest ein gewollter
  Ausschnitt, und der erste Pilotlauf hätte Wiki-Seiten und State aller übrigen
  Quellen gelöscht.
- **`scripts/brain-ingest.sh` misst 545 Zeilen** (Budget 640). Die
  Phase-2b-Sektion ist wie in Aufgabe 12 vorgesehen nach
  `scripts/brain-ingest-moc.sh` extrahiert, nicht kosmetisch zusammengezogen.
