---
title: PostgreSQL-Integrität und SDLC-Kontext reparieren
ticket_id: T901697
domains: [scripts-infra, tickets, knowledge, devflow]
status: planned
---
# sdlc-integrity — Implementation Plan

## File Structure

Bachelor-Worktree: `/home/patrick/.worktrees/Bachelorprojekt-37ac27be/fix/sdlc-integrity-T901697`.
Ausdrücklich geteilter Dotfiles-Worktree: `/home/patrick/.worktrees/dotfiles/fix/sdlc-integrity-T901697`.
Ein gemeinsamer Plan, sequenzielle Tasks, Commit/Push/Merge durch den Orchestrator.

Bachelor-Dateien mit aktuellen Zeilen und wirksamem Restbudget; alle sind nicht baselined,
Extension-Limit 800, `.ts` 900 gemäß `docs/code-quality/gates.yaml`:

| Datei | Ist | Budget |
|---|---:|---:|
| `scripts/lib/ticket-links.sh` | 172 | 628 |
| `scripts/knowledge/lib-knowledge-pg.mjs` | 166 | 634 |
| `scripts/knowledge/lib-knowledge-pg.d.ts` | 57 | 843 |
| `scripts/knowledge/ingest-markdown.mjs` | 112 | 688 |
| `scripts/knowledge/ingest-bug-tickets.mjs` | 87 | 713 |
| `scripts/knowledge/ingest-prs.mjs` | 76 | 724 |
| `scripts/knowledge/ingest-web.mjs` | 268 | 532 |
| `scripts/knowledge/ingest-context7.mjs` | 192 | 608 |
| `scripts/llm/plan-stage-index.mjs` | 163 | 637 |
| `scripts/vda/ticket/stage-plan.sh` | 190 | 610 |
| `scripts/vda/ticket/assert-phase-chain.sh` | 59 | 741 |
| `tests/py/unit/ported/test_knowledge_ingest_schema.py` | 68 | 732 |
| `tests/py/spec/native_ported/spec/devflow-mcp/test_retrieval.py` | 306 | 494 |
| `tests/py/spec/native_ported/spec/devflow-mcp/test_graph_index.py` | 246 | 554 |
| `tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py` | 259 | 541 |
| `tests/py/unit/ported/scripts/test_stage_plan.py` | 107 | 693 |
| `tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py` | 54 | 746 |

Neue Dateien: `scripts/knowledge/audit-integrity.mjs` (Ziel unter 400 Zeilen, Limit 800),
`docs/runbooks/sdlc-integrity.md` (Bedienung und Evidenzgrenzen), diese drei Planartefakte.
Der Audit wird aus bestehendem Test und Runbook referenziert; S4 ist damit erfüllt.
Testinventar/Repoindex werden ausschließlich mit den vorhandenen Generierungs-Tasks erzeugt.

Dotfiles-Dateien liegen außerhalb des Bachelor-S1-Scans, daher kein erfundenes dortiges Ratchet-Budget:
`mcp-servers/devflow/server.mjs` (227), `mcp-servers/devflow/sync-db.mjs` (77),
`mcp-servers/devflow/lib/retrieve.mjs` (99), `mcp-servers/devflow/lib/backends.mjs` (112),
`mcp-servers/devflow/lib/graph-cache.mjs` (66), `mcp-servers/devflow/lib/plan-stage.mjs` (85),
`scripts/lib/ticket_links.py` (259), `tests/unit/test_ticket_links.py` (128).
Nur bei notwendiger gemeinsamer Pfadauflösung: neuer pure Helper `mcp-servers/devflow/lib/config.mjs`,
Ziel unter 150 Zeilen, ohne Rückimport auf Server/DB. Keine S2-Zyklen, keine neuen Brand-Hostliterale,
keine Baseline-/Ignore-Ausnahmen. Bestehende Tests erweitern. Kein Website-/API-Behavior betroffen.

## Task 1: Reproduzierbare RED-Anker bestätigen

- [ ] Vor Produktionsänderungen aus beiden genannten Worktrees Tests ausführen (expected: FAIL).
  Die sechs Regressionen wurden bereits ausgeführt: vier Bachelor-Tests scheitern an Datenverlust,
  fehlendem Modell-/OpenSpec-Filter und erfolgreichem Exit trotz fehlendem Cache;
  zwei Dotfiles-Tests scheitern an unsichtbarem `relates_to` und direktem `blocked_by`.

```bash
export AGENT_LOCK_SID=2363076
export MCP_SERVERS_HOME=/home/patrick/.worktrees/dotfiles/fix/sdlc-integrity-T901697/mcp-servers
PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/unit/ported/test_knowledge_ingest_schema.py tests/py/spec/native_ported/spec/devflow-mcp/test_retrieval.py tests/py/spec/native_ported/spec/devflow-mcp/test_graph_index.py -k 'document_replacement_rolls_back or knowledge_candidates_exclude or graph_sync_missing_cache'
```

Im Dotfiles-Worktree:

```bash
export AGENT_LOCK_SID=2363076
uv run -q --with pytest pytest -q tests/unit/test_ticket_links.py -k 'reader_accepts or reader_includes'
```

- [x] Die bestehende disposable PG16+pgvector-Instanz nutzen: Container
  `sdlc-integrity-T901697-pg`, ausschließlich `127.0.0.1:45081`, DB/User postgres.
  Root hat bereits einen echten SQLSTATE-23514-Fehler am Chunk-Insert erzeugt:
  Dokument vorher `old` + `old-complete`, danach `new` + null Chunks.
  Isoliertes Fixture erweitern: direkte/rückwärtige Linkformen, Duplikate und positive Anker.
  Keine Live-DB für mutierende Tests verwenden.

## Task 2: Ticket-Kanten in beiden Readern reparieren (F1)

- [x] Beide Reader lesen `relates_to`, behalten JSON-Key `relates`, deduplizieren symmetrische Kanten.
- [x] `blocked_by` vereinigt ausgehende direkte Kanten mit eingehenden `blocks`, dedupliziert IDs.
  Bestehende blocks/child_of/pr-, Offline- und Fehlerverträge bleiben abgedeckt.
- [x] SQL-Resultat beider Reader gegen isolierte PG-Fixture testen, nicht nur SQL-Text vergleichen.
  Gleiche Kante in beiden Formen ergibt genau eine ID; unbekanntes Ticket ergibt leere Arrays.

## Task 3: Knowledge-Ersetzungen atomar und Modellherkunft eindeutig machen (F2/F6)

- [x] Ein Client aus `pool.connect()`: BEGIN → locked document upsert → replace chunks → COMMIT.
  Fehler: ROLLBACK, ursprünglichen Fehler erhalten, finally release. Unique-Upsert serialisiert
  gleichzeitige Ersetzungen desselben `(collection_id,source_uri)` bis Commit.
- [x] `chunks=null` nur bei belegtem unverändertem bisherigen Hash zulassen; alte vollständige
  Daten bei nicht belegbarer Wiederverwendung behalten. Test: gleicher Hash reuse, geänderter Hash
  ohne Chunks fail/rollback, Fehler beim zweiten Chunk, erfolgreicher kompletter Ersatz.
- [x] Reine Collection-Zählerkorrektur von erfolgreicher Indexzeit trennen. Existierende
  `bumpCollectionStats`-Aufrufer bleiben kompatibel; kein historischer Corpus gilt dadurch als frisch.
- [x] `embedAllWithModel` ergänzen; bestehenden `embedAll`-Wrapper beibehalten und `.d.ts` anpassen.
  Alle fünf Knowledge-Ingests plus plan-stage-index speichern pro Chunk den tatsächlichen
  Modellnamen in metadata. Nach BGE-Teilfehler gesamten Batch mit Voyage neu berechnen.
- [x] Gegen echte Test-PG zwei überlappende Ersetzungen desselben Dokuments starten:
  keine gemischten Chunksets, finaler Hash passt zu vollständig gespeichertem Chunkset.
  Anderes Dokument wird nicht unnötig global serialisiert. Erfolg und Fehler prüfen.

## Task 4: Historischen Corpus aus Standardsuche ausschließen (F2/F6)

- [x] In `searchKnowledge` Filter VOR ORDER BY/LIMIT setzen: `c.metadata.embedding_model`
  entspricht Query-Modell; unbekannte Herkunft ausgeschlossen. Collection-Modell darf keine
  fehlende Chunk-Herkunft erfinden. Bestehende source-Filter und Dokument-Deduplizierung erhalten.
- [x] Historische OpenSpec-Collections und OpenSpec-Dateipfade in Standardsuche ausschließen.
  Keine Reaktivierung, Umbenennung, Löschung oder fingierte Neubewertung alter Daten.
- [x] Test-PG-Fixture mit vielen besser gerankten inkompatiblen/historischen Chunks und einem
  gültigen aktuellen Chunk: letzterer bleibt Kandidat trotz Top-k. Empty Corpus wird ehrlich
  ausgegeben, nicht durch alte Doktrin aufgefüllt.
- [x] Read-only source freshness audit für file-URIs mit existence/hash/root-bounds; current,
  changed, missing und unverifiable getrennt. Zählerabweichung und Quellfrische sind unabhängig.

## Task 5: Zentrale MCP-Konfiguration und Sync-Fehlerverträge reparieren (F5)

- [x] Repository-/Registry-/Lock-/Knowledge-Modul aus expliziter Prozessquelle auflösen;
  DEVFLOW_REPO_ROOT und TOOLSET_HOME sowie Einzel-Overrides respektieren.
  Default-Bachelor-Quelle folgt vorhandener Umzugskonvention, nicht SCRIPT_REPO/Home-docs.
- [x] Vorhandene Endpointkonfiguration und Proxy-Adapter lesen, bevor Backendfallback geändert wird.
  Kein Hub-BGE erfinden, keine Kreisverbindung. STDIO/URL-Overrides weiter unterstützen;
  ohne verfügbaren Embeddingpfad explizit degraded, Tools können lexical fallback verwenden.
- [x] `sync-db` missing cache, Import, PGURL und DB-Fehler nonzero. Zuerst Live-Quellconstraint
  read-only prüfen; inkompatibles `code_graph` klar melden, bevor Collection/Document verändert wird.
  Keine Schema-Erweiterung und keine Löschungen alter Dokumente im Sync.
- [x] `plan-stage.mjs` verwendet den gemeinsamen agent-workspace-Helper und ausschließlich
  `/home/patrick/.worktrees/<repo>/<branch>` statt repo-lokaler Worktrees. Claims/Hooks erhalten.
- [x] Offline Prozessstart aus fremdem cwd plus Override-Tests, Backend-Abwesenheit und
  Sync-Fehler nachweisen; temporäre isolierte Quelle statt produktiver Dienste verwenden.

## Task 6: Bestehendes Staging/Gate begrenzt härten (F3)

- [x] Eine SQL-Transaktion für Status/slot_count, touched_files, readiness Hold/Release und
  Planreferenz. Fehlgeschlagene SQL-Schritte brechen ab, kein Erfolgstext und kein Tick bei Rollback.
  Force-tick und fail-soft Indexierung erst nach Commit.
- [x] Keine synthetischen scout/design-Abschlüsse. Planabschluss nur für committed Planreferenz
  bezeugen. Bestehende tatsächliche Events unverändert erhalten.
- [x] Phasengate prüft Reihenfolge `(at,id)`, behandelt `auto: stage-plan` als synthetisch und
  ersetzt Backfill-Erfolgsempfehlung durch Diagnose fehlender Evidenz. Kompatible ok/missing-Keys
  erhalten; weitere Nachweisgrenzen explizit in JSON. Kein gemeinsamer Lauf/Commit-Beweis erfunden.
- [x] Bestehende Stage-Tests um hold/no-hold Wiederholung, SQL-Fehler/Rollback und nicht existente
  Tickets ergänzen. Eventfixtures: komplette Reihenfolge, falsche Reihenfolge, fehlende Phase,
  nur synthetische Events. Gate darf nur die tatsächlich geprüfte Grenze als bestanden melden.

## Task 7: Lesenden Integritäts- und Coverage-Audit liefern (F3/F4/F7)

- [x] Ein Audit-CLI mit read-only PG-Transaktion, injectable query boundary und maschinenlesbarem
  JSON: Constraints/Indexes, Referenzen, echte Collection-Zähler, Modellherkunft, Quellfrische,
  Phasenreihenfolge/-lücken, GitHub-Abdeckung und fehlende Resolutions. Keine Mutation/Backfills.
- [x] GitHub-Tabellen ohne Zeilen: `unpopulated`/`unknown`, mit geprüfter Anzahl als Positivanker;
  FK-Konsistenz allein ist kein Beleg für vollständige Ticket→PR→Verify→Deploy-Kette.
- [x] Graphstatus und Code-Suche ergänzen: freshness getrennt von coverage, unknown bei fehlenden
  Metadaten, degraded bei Partial-/Parsefehlern. Bestehende Metadata konsumieren, keinen SQL-Parser
  bauen. Leere Treffer liefern keine Integritätsbestätigung. Query-/Cache-Modell prüfen.
- [x] Offline Testdaten für leere und gefüllte Nachweisquellen, stale/unknown/degraded Graph,
  veränderte/missing Dateien, Zählerabweichung; ausgeführte Reader besitzen positive Datenanker.
- [x] Runbook dokumentiert Bedienung, historische Collections, root/endpoint Konfiguration,
  aktuelle Doktrinquelle und Evidenzgrenzen. Kein automatisches Live-Reparaturkommando.

## Task 8: Finale Verifikation

- [x] Sechs RED-Anker werden grün, vollständige betroffene bestehende Suites laufen.
  Zusätzlich echte isolierte PG-Fixture F1/F2/Top-k-/readonly-Audit ausführen und Evidenz speichern.
  Kein Prod-Deploy, kein historischer Datenpurge, suspendierter CronJob bleibt unverändert.
- [x] Beide Worktrees diff/Claims/CI-Zuordnung prüfen; gemeinsame MCP-Tests erhalten
  MCP_SERVERS_HOME und TOOLSET_HOME explizit. Test-Inventar nach Änderungen regenerieren.
- [x] Obligatorische Bachelor-Gates aus dessen Worktree ausführen:

```bash
export AGENT_LOCK_SID=2363076
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

- [x] Dotfiles relevante unit tests und dessen erforderliche Commit-/CI-Gates ausführen.
  Keine Baseline-Key-Erhöhung oder Ignore-Ausnahme. Receipt/Archive folgt bestehendem
  dev-flow-Lifecycle nach tatsächlichem Merge; kein vorzeitiges Löschen dieses Plans.
