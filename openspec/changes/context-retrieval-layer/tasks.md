---
title: "context-retrieval-layer — Retrieval-Schicht für Kontexttransfer (Embedding + Reranking)"
ticket_id: T002658
domains: [agents, knowledge, db]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# context-retrieval-layer — Implementation Plan

Baut `scripts/context-retrieve.mjs`: eine reine Funktion von (Aufgabentext, Rolle, Budget) auf
einen budgetierten, gerankten und herkunfts-markierten Kontextblock. Sie ersetzt langfristig den
Volltext-Dump der vier `*-context.sh`-Skripte, bekommt in diesem Change aber noch keinen
produktiven Aufrufer — die Umstellung der Kanäle ist S3 und liegt ausserhalb.

Zusätzlich wird der in `migrations/20260717-drop-unused-indexes.sql` gedroppte HNSW-Index auf
`knowledge.chunks.embedding` wiederhergestellt. Ohne ihn ist jede Vektorsuche ein Sequential
Scan, und `openspec/specs/openspec-pgvector.md` sichert den Index seit dem Drop fälschlich zu.

Design-Rationale: `openspec/changes/context-retrieval-layer/design.md`.

_Ticket: T002658_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `migrations/20260804-restore-knowledge-chunks-hnsw.sql` | neu | — |
| `scripts/knowledge/lib-context-retrieve.mjs` | neu | — |
| `scripts/knowledge/lib-context-pinned.mjs` | neu | — |
| `scripts/context-retrieve.mjs` | neu | — |
| `Taskfile.yml` | 5150 | — |
| `tests/spec/openspec-pgvector/context-retrieve-cli.bats` | neu | — |
| `tests/spec/openspec-pgvector/context-retrieve-fallback.bats` | neu | — |
| `tests/spec/openspec-pgvector/context-retrieve-recall.bats` | neu | — |
| `tests/fixtures/context-retrieve/golden-queries.json` | neu | — |

`.sql`, `.yml`, `.bats` und `.json` tragen kein S1-Extension-Limit. Die drei neuen `.mjs`-Dateien
sind neu angelegt und damit gegen das statische Extension-Limit von 800 Zeilen zu schneiden; die
Logik ist bewusst auf drei Module verteilt (Kernretrieval, Pinned-Set, CLI), damit keines davon
in die Nähe dieser Schwelle wächst, wenn S2 und S3 weitere Korpora und Aufrufer hinzufügen.
Jedes Modul ist mit rund 250 bis 300 Zeilen veranschlagt.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-migration.md` | impl | `migrations/20260804-restore-knowledge-chunks-hnsw.sql` | |
| p2 | `tasks.d/p2-retrieval.md` | impl | `scripts/knowledge/lib-context-retrieve.mjs` | |
| p3 | `tasks.d/p3-pinned.md` | impl | `scripts/knowledge/lib-context-pinned.mjs` | |
| p4 | `tasks.d/p4-cli.md` | impl | `scripts/context-retrieve.mjs` | p2, p3 |
| p5 | `tasks.d/p5-taskfile.md` | impl | `Taskfile.yml` | p4 |
| p6 | `tasks.d/p6-tests.md` | tests | `tests/spec/openspec-pgvector/context-retrieve-cli.bats`, `tests/spec/openspec-pgvector/context-retrieve-fallback.bats`, `tests/spec/openspec-pgvector/context-retrieve-recall.bats`, `tests/fixtures/context-retrieve/golden-queries.json` | p1, p2, p3, p4, p5 |

Die Partials sind disjunkt — keine Datei erscheint in zwei Zeilen; `validateDisjoint()` im
Factory-Parser wirft sonst. p6 trägt die Test-Rolle und läuft als letztes Partial.

Die Detailanweisungen je Partial stehen in `tasks.d/`; diese Datei ist der Index.

## Vorbedingung — Latenz-Sockel klären (kein eigenes Partial)

Bei der Plan-Erstellung am 2026-08-04 wurde die Latenz beider Backends gemessen. Die Zahlen
stellen die Wirtschaftlichkeit der gesamten Schicht in Frage und müssen vor p2 geklärt sein:

| Operation | Messung |
| --- | --- |
| Embedding, 13 Tokens, kalt | 10,72 s |
| Embedding, warm, zwei Wiederholungen | 10,87 s / 10,75 s |
| Rerank, 5 Dokumente | 3,38 s |
| Rerank, 20 Dokumente | 11,21 s |

Der Rerank skaliert linear mit rund 0,55 s pro Dokument; 40 Kandidaten entsprächen etwa 22 s.
Zusammen mit dem Embedding läge ein Dispatch bei rund 33 s. Das ist für einen Pfad, der bei
jedem Agent-Dispatch läuft, nicht tragbar.

Auffällig war die Verteilung: 13 Tokens zu embedden dauerte länger als 5 Dokumente durch den
teureren Cross-Encoder zu reranken. Rechenaufwand erklärt das nicht.

### ERLEDIGT — Ursache gefunden und behoben (T002661, PR #3794, gemergt 2026-08-04)

Die Ursache war weder Batch-Füllung noch die fehlende GPU, sondern **Thread-Oversubscription
gegen die CPU-Quota**: `k3d/llm-gpu.yaml` setzte kein `-t`, llama.cpp wählte deshalb `nproc` = 8,
während `limits.cpu: 2000m` nur 2 Kerne erlaubt. Gemessen am laufenden Pod: 5003 von 9172
Scheduling-Perioden gedrosselt (54,5 %), `throttled_usec` 2028 s gegen `usage_usec` 1181 s — der
Container wurde länger gedrosselt als er rechnete.

Nach `-t 2` und der Flux-Reconciliation:

| Operation | vorher | nachher | Faktor |
| --- | --- | --- | --- |
| Embedding, 13 Tokens | 10,75 s | **0,25 s** | 43× |
| Rerank, 5 Dokumente | 3,38 s | 1,11 s | 3,0× |
| Rerank, 20 Dokumente | 11,21 s | 3,42 s | 3,3× |
| Rerank, 40 Dokumente | ~22 s (hochgerechnet) | **6,35 s** | ~3,5× |

Ein S1-Dispatch mit 40 Kandidaten kostet damit rund **6,6 s** statt 33 s. Die Vorbedingung ist
erfüllt, die Schicht ist wirtschaftlich.

### Was daraus für den Entwurf folgt — verbindlich für p2, p4 und p6

Die Kostenverteilung hat sich umgekehrt: der Rerank stellt jetzt **96 % der Dispatch-Zeit**. Das
Embedding war zu über 95 % Wartezeit und ist praktisch kostenlos geworden; der Rerank war
rechengebunden und gewinnt nur, was 2 ungedrosselte gegen 8 gedrosselte Kerne hergeben. Damit
trifft die Designannahme zu, und die Kandidatenzahl vor dem Rerank ist die einzige Stellschraube,
die zählt.

1. **p6:** Der Vorgabewert `limit=40` ist gegen 20 und 10 zu messen — 20 Kandidaten kosten
   3,42 s, also knapp die Hälfte. Die Kalibrierung entscheidet jetzt über Recall gegen Latenz,
   nicht mehr über Machbarkeit.
2. **p2:** Der Query-Embedding-Cache verliert seine tragende Rolle. Bei 0,25 s ist er eine
   Optimierung, keine Voraussetzung mehr; eine prozesslokale Map genügt, die Dateiablage unter
   `tmp/context-retrieve-cache/` entfällt.
3. **p4:** Der Timeout der Fallback-Kette ist an der **neuen** Latenz zu bemessen. Ein Wert,
   der die alten 10,7 s abdeckte, liesse einen echten Ausfall jetzt minutenlang als Hänger
   erscheinen statt als Fallback.

Diese Vorbedingung ändert die Partial-Aufteilung nicht.

## Task F — Finale Verifikation (nach allen Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich vor dem Pull Request:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-pgvector/
task test:inventory
```

## Risiken

- **Ein Timeout neben der realen Latenz macht den Fallback zum Dauerzustand oder blind.** Bei der
  Plan-Erstellung sah der Endpunkt zunächst tot aus: `curl` mit 5 und 8 Sekunden lief in den
  Timeout, während `systemctl --user` alle drei bge-Units als `active` meldete. Tatsächlich
  antwortete der Dienst — nur nach 10,7 s; die Pod-Logs wiesen die abgebrochenen Anfragen als
  `cancel task` aus, also den Client als Verursacher. Nach T002661 liegt die Latenz bei 0,25 s,
  womit sich die Gefahr **umkehrt**: ein Timeout, der grosszügig für die alten 10,7 s bemessen
  wäre, liesse einen echten Ausfall minutenlang als Hänger erscheinen statt als Fallback. Für
  p4 gilt deshalb beides: der Fallback prüft ausschliesslich eine tatsächliche Antwort, nie
  Prozess- oder Unit-Zustand — und der Timeout wird aus der **aktuell gemessenen** Latenz plus
  Reserve abgeleitet, nicht aus einem historischen Wert.
- **Der Query-Cache ist nur noch eine Optimierung (revidiert nach T002661).** Bei 0,25 s pro
  Query-Embedding ist das Zwischenspeichern keine Voraussetzung mehr dafür, dass mehrere Partials
  desselben Dispatches bedient werden können. Eine prozesslokale Map genügt; die Dateiablage unter
  `tmp/context-retrieve-cache/` entfällt und mit ihr deren Invalidierungsfragen.
- **Golden-Set-Pflege.** Ein Recall-Test gegen einen wachsenden Korpus kann scheitern, weil neue,
  besser passende Chunks den geforderten verdrängen — ohne dass die Qualität gesunken ist. Die
  Fixture verlangt deshalb nur, dass der geforderte Chunk enthalten ist, nicht dass er an erster
  Stelle steht.
- **Konkurrenz um die GPU.** T002628 (GPU-Arbitrierung, Trainings-Vorrang) läuft parallel. Die
  Rerank-Aufrufe dieser Schicht sind kurz, treten aber bei jedem Dispatch auf. Führt T002628 eine
  Vorrang-Regelung ein, gehört diese Schicht auf die nachrangige Seite: ein verzögerter
  Kontextblock ist erträglich, ein unterbrochener Trainingslauf nicht.

## Out of Scope

- Umstellung von `plan-context.sh`, `task-context.sh`, `toolset-context.sh` und
  `openspec-context.sh` auf diese Schicht — das ist S3 und bekommt ein eigenes Ticket.
- Aufnahme von Skills, `references/*.md`, Gotchas und `capabilities.yaml` in den Index — S2.
- `intel.json` und Session-Handoffs — S4, anderes Zugriffsmuster (write-once/read-once).
- Reparatur des toten bge-Port-Forwards. Der Befund steht oben als Risiko und betrifft die lokale
  Betriebsumgebung, nicht den Code dieses Changes.
