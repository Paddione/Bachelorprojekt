---
title: Dense-Gemma-Vertrag, Migrationssicherheit und Consumer-Verifikation
domains: [llm, knowledge, testing]
status: planned
---
# p3-tests — Implementation Plan

## File Structure

Dieser Partial besitzt ausschließlich Testdateien und die angegebene Fixture. Implementierungsdateien besitzen p1 und p2; Dotfiles-Quellen besitzen der separate Dotfiles-Plan. Arbeitsverzeichnis ist der Bachelor-Worktree `/home/patrick/.worktrees/Bachelorprojekt-37ac27be/feature/embeddinggemma-dense-768`. Vor jedem Shell-Aufruf `export AGENT_LOCK_SID=codex-embeddinggemma-20261026` setzen. Basis-Revision vor Ausführung aus `git -C "$PWD" rev-parse HEAD` im Evidence-Log festhalten.

Neue Dateien:

- `scripts/lib/dense-embedding.test.mjs`: reiner Profilvertrag mit Tokenizer-Fixtures.
- `scripts/knowledge/dense-migration.test.mjs`: injizierte PostgreSQL-/HTTP-Adapter für Zustandsmaschine, Snapshot-Coverage und Transaktionsfehler.
- `components/website/src/lib/dense-embedding-guard.test.ts`: DB-Generations- und Writer-Gate-Verhalten.

Zu erweitern:

- `components/website/src/lib/embeddings.test.ts`
- `components/website/src/lib/knowledge-db.test.ts`
- `components/website/src/lib/ingest-json-core.test.ts`
- `components/website/src/lib/coaching-questionnaire-insights.test.ts`
- `components/website/src/lib/sdlc/codesearch-db.test.ts`
- `components/website/src/pages/sdlc/api/ki/embeddings.test.ts`
- `components/website/src/lib/tickets-embed.test.ts`
- `scripts/index-repo.test.ts`
- `scripts/llm-proxy/bge-routes.test.mjs`
- `tests/py/spec/native_ported/spec/llm-pipeline/test_bge_bulk_pool.py`
- `tests/py/spec/native_ported/spec/llm-pipeline/test_bge_thread_quota.py`
- `tests/py/spec/native_ported/spec/llm-pipeline/test_knowledge_ingest_live_sources.py`
- `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_role_routes.py`
- `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_registry_roles.py`
- `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py`
- `tests/py/spec/native_ported/spec/devflow-mcp/test_graph_index.py`
- `tests/py/spec/native_ported/spec/devflow-mcp/test_retrieval.py`
- `tests/spec/devflow-mcp/fixtures/fake-bge.mjs`
- `tests/py/unit/ported/test_scs_index.py`
- `tests/py/unit/ported/test_knowledge_ingest_schema.py`

Generiertes `components/website/src/data/test-inventory.json` wird einmal vom Orchestrator nach allen Teständerungen regeneriert und gehört keiner parallelen Implementierung.

## Verträge und Akzeptanz

p1 liefert `DENSE_MODEL='embeddinggemma-300m'`, `DENSE_DIMENSIONS=768`, `DENSE_PROFILE='embeddinggemma-300m:768:Q8_0:v1'`, `DENSE_MAX_TOKENS=2048`, `formatDenseInput(text,purpose,title?)`, `assertDenseVectors(vectors,expectedCount)` und `splitDenseText(text,{tokenize,purpose,maxTokens})`. `purpose` ist `query|index`; Tokenizer zählt das fertig formatierte Eingabetextstück einschließlich Spezialtokens. Ein Split darf keine Originalzeichen verlieren und keine Eingabe über dem Limit ausgeben.

p2 liefert `scripts/knowledge/dense-client.mjs`, `dense-migration-control.mjs`, `dense-reindex-knowledge.mjs`, `dense-reindex-code.mjs`, `dense-migration.mjs` sowie `components/website/src/lib/dense-embedding-guard.ts`. Die CLI hat `prepare|reindex|verify|cutover|rollback|status --run-id <id>`, Mutationen erfolgen nur über explizite Kommandos gegen explizites `PGURL`.

Tests laufen ohne echte externe Modellaufrufe. Fixtures beweisen Verdrahtung und Fehlerbehandlung, keine Modellqualität. Live-Smoketests und reale Reindex-Vollständigkeit sind separate Ausführungsevidenz des Orchestrators.

## S1-Budgets

Messung: existierende Dateien sind nicht baselined; effektive Schwelle `.ts=900`, `.mjs/.py=800` gemäß `docs/code-quality/gates.yaml`. Kein Baseline-/Ignore-Wachstum. Alle Erweiterungen bleiben unter 80 Prozent der wirksamen Schwelle; bei Überschreitung echte Testfall-Aufteilung statt Zeilenkompression.

| Datei | Ist | Effektive Schwelle | Reserve |
|---|---:|---:|---:|
| `components/website/src/lib/embeddings.test.ts` | 129 | 900 | 771 |
| `components/website/src/lib/knowledge-db.test.ts` | 350 | 900 | 550 |
| `components/website/src/lib/ingest-json-core.test.ts` | 111 | 900 | 789 |
| `components/website/src/lib/coaching-questionnaire-insights.test.ts` | 212 | 900 | 688 |
| `components/website/src/lib/sdlc/codesearch-db.test.ts` | 199 | 900 | 701 |
| `components/website/src/pages/sdlc/api/ki/embeddings.test.ts` | 51 | 900 | 849 |
| `components/website/src/lib/tickets-embed.test.ts` | 135 | 900 | 765 |
| `scripts/index-repo.test.ts` | 196 | 900 | 704 |
| `scripts/llm-proxy/bge-routes.test.mjs` | 351 | 800 | 449 |
| `tests/py/spec/native_ported/spec/llm-pipeline/test_bge_bulk_pool.py` | 87 | 800 | 713 |
| `tests/py/spec/native_ported/spec/llm-pipeline/test_bge_thread_quota.py` | 108 | 800 | 692 |
| `tests/py/spec/native_ported/spec/llm-pipeline/test_knowledge_ingest_live_sources.py` | 98 | 800 | 702 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_role_routes.py` | 106 | 800 | 694 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_registry_roles.py` | 72 | 800 | 728 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py` | 62 | 800 | 738 |
| `tests/py/spec/native_ported/spec/devflow-mcp/test_graph_index.py` | 236 | 800 | 564 |
| `tests/py/spec/native_ported/spec/devflow-mcp/test_retrieval.py` | 307 | 800 | 493 |
| `tests/spec/devflow-mcp/fixtures/fake-bge.mjs` | 46 | 800 | 754 |
| `tests/py/unit/ported/test_scs_index.py` | 169 | 800 | 631 |
| `tests/py/unit/ported/test_knowledge_ingest_schema.py` | 68 | 800 | 732 |

Neue `.mjs`-Tests jeweils höchstens 400 Zeilen, neuer `.ts`-Test höchstens 300 Zeilen. Gemeinsame Fixture-Helfer nur bei echter Wiederverwendung extrahieren; neue Dateien über Test-Inventar und konkrete Runner-Aufrufe erreichbar machen.

## Task 1 — Reinen Modellvertrag rot absichern

- [ ] Neue `dense-embedding.test.mjs` mit Node-Test-Runner schreiben: 768d, Query `task: search result | query: `, Dokument `title: none | text: `, optionaler Titel, kein BGE/LFM-Prefix; ungültigen Purpose ablehnen.
- [ ] Count-Mismatch, 1024/767 Dimensionen, NaN, Infinity und Nullvektor müssen vor jedem Indexschreiben scheitern. Gültige finite nicht-null 768-Vektoren erhalten.
- [ ] Token-Split mit einer Tokenizer-Fixture prüfen, die Prefix-/Spezialtokenkosten mitzählt: Unicode, lange einzelne Zeile, leere Eingabe, Eingabe genau am Limit; jeder Teil unter 2048 Tokens, `parts.join('')` exakt gleich Original.
- [ ] Vor p1-Implementierung ausführen: `node --test scripts/lib/dense-embedding.test.mjs` — expected: FAIL wegen fehlendem/neuem Vertrag. RED-Output mit Basis-SHA aufbewahren.
- [ ] Nach p1: derselbe Befehl erwartet Exit 0. Die Tests prüfen Verhalten, keine bloße Stringkopie der Implementierung.

## Task 2 — Clients und neue Vektorraumgrenze absichern

- [ ] Bestehende TS-Tests auf 768d und tatsächliche Query-/Dokument-Payloads umstellen. Genau ein Prefix, korrekter Modellname, erwartete Zahl und Reihenfolge der Vektoren; Fehlantworten niemals als erfolgreicher Index-/Query-Aufruf durchreichen.
- [ ] `knowledge-db` blockiert alten einzelnen BGE-Raum ebenso wie gemischte Räume; leere Collectionliste bleibt leer ohne externen Aufruf. Migrations-Gate blockiert Writes und Query gegen falsche aktive Generation.
- [ ] `ingest-json-core` darf Collectionlabel nicht vor erfolgreichem Chunk-Commit umstellen. Bei Upstreamfehlern bleiben Modellkennung und alter Bestand unverändert.
- [ ] Insights-Cache verwendet Profilkennung oder verwirft alte BGE-Ergebnisse. APIs und Legacy-Tickettypen bleiben konsistent mit 768; retired Ticket-System nicht reaktivieren.
- [ ] Rotlauf vor p2: `pnpm --dir components/website exec vitest run src/lib/embeddings.test.ts src/lib/knowledge-db.test.ts src/lib/ingest-json-core.test.ts src/lib/coaching-questionnaire-insights.test.ts src/lib/sdlc/codesearch-db.test.ts src/lib/dense-embedding-guard.test.ts src/lib/tickets-embed.test.ts src/pages/sdlc/api/ki/embeddings.test.ts` — expected: FAIL für die neuen Grenzen; nach p2 derselbe Befehl Exit 0.
- [ ] `scripts/index-repo.test.ts`: Profilwechsel erzwingt Reindex trotz identischem Dateihash, Wiederholung im gleichen Profil darf wiederverwenden; leere/kaputte Vektoren schreiben keine unvollständige Datei.
- [ ] `npm run test:unit -- --project unit scripts/index-repo.test.ts` erwartet nach p2 Exit 0.

## Task 3 — Migration, Resume und Rückfall beweisen

- [ ] `dense-migration.test.mjs` mit injizierten pg/fetch-Adaptern schreiben. `--dry-run` mutiert keine Tabellen; unbekannte Run-ID, anderer Modellfingerprint und paralleler Run scheitern geschlossen.
- [ ] Knowledge-Fixture mit altem Chunk oberhalb 2048 Tokens erzeugt mehrere neue Shadow-Zeilen mit Herkunft und lückenloser Textabdeckung. Code-Fixture enthält unveränderte Dateihashes; trotzdem werden alle alten Codezeilen migriert.
- [ ] Abbruch nach erfolgreichem Batch und Resume: nur nachgewiesen fertig gestellte, profilidentische Einträge wiederverwenden; keine Lücken oder doppelten Teilstücke. Quellhashänderung beim Resume zwingt Neuberechnung beziehungsweise blockiert Verifikation.
- [ ] Verifikation verlangt vollständige Quell-Coverage, Teilstückzuordnung, 768d und endliche nicht-null Vektoren. Ein fehlender Teil, extra veralteter Quellhash oder 1024-Vektor verhindert Cutover.
- [ ] Cutover-Transaktion scheitert nach einem simulierten Rename: Rollback lässt alten Index/Collectionlabel aktiv. Erfolgreicher Swap hält BGE-Backup; expliziter Rückfall stellt Tabellen und Profil zusammen wieder her. Writer-Gate wird auch im Fehlerpfad definiert behandelt; keine Teilaktivierung.
- [ ] `node --test scripts/knowledge/dense-migration.test.mjs` — expected: FAIL vor p2, danach Exit 0.
- [ ] Native pgvector-Integration separat gegen eine isolierte Testdatenbank ausführen: echte Typmodifikationen/Indices/FKs und 1:n-Shadow-Swap samt Rollback prüfen. Kein DDL-Test gegen den bestehenden Benutzerindex. Fehlende isolierte PostgreSQL-Laufzeit als nicht ausgeführte Integration melden, keinen Fixturepass als Livebeleg ausgeben.

## Task 4 — Infrastruktur und grenzübergreifenden Graphcache absichern

- [ ] Bestehende Manifesttests auf Gemma-Embed und 2-CPU-Quota aktualisieren; BGE-Rerankerblock, LFM und ColBERT unverändert prüfen. Bulk-Replikate bleiben profilidentisch zum Haupt-Embedder; Tablet-BGE darf nicht als Gemma-Fallback im Embed-Pool bleiben.
- [ ] `bge-routes.test.mjs` beweist unveränderte Pfad-/Failoversemantik und dass der Proxy bereits formatierte Eingaben unverändert weiterleitet.
- [ ] `fake-bge.mjs` standardmäßig auf 768 deterministische normalisierte Werte erweitern; explizite fehlerhafte Dimensionsoption und Purpose-Log ergänzen. Rerank-Fixture unverändert lassen.
- [ ] Devflow-Tests mit `MCP_SERVERS_HOME=/home/patrick/.worktrees/dotfiles/feature/embeddinggemma-dense-768/mcp-servers` und `TOOLSET_HOME=$PWD/scripts/toolset` gegen beide Worktrees ausführen. Index-Aufrufe müssen `purpose=index`, Queries `purpose=query` liefern. Modell-/Profilwechsel darf keinen 1024-Cache wiederverwenden; fehlendes Profil und NaN-Matrix liefern definierte Degradation statt NaN-Treffer.
- [ ] `node --test scripts/llm-proxy/bge-routes.test.mjs` und `python3 -m pytest tests/py/spec/native_ported/spec/llm-pipeline/test_bge_bulk_pool.py tests/py/spec/native_ported/spec/llm-pipeline/test_bge_thread_quota.py tests/py/spec/native_ported/spec/llm-pipeline/test_knowledge_ingest_live_sources.py tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_role_routes.py tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_registry_roles.py tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py tests/py/spec/native_ported/spec/devflow-mcp/test_graph_index.py tests/py/spec/native_ported/spec/devflow-mcp/test_retrieval.py tests/py/unit/ported/test_scs_index.py tests/py/unit/ported/test_knowledge_ingest_schema.py -q` erwarten Exit 0. Vor Implementierung müssen neue Purpose-/Profilfälle rot sein, nicht per Skip unterdrückt.

## Task 5 — Abschließende Verifikation

- [ ] `task test:inventory` regeneriert das Test-Inventar nach neuen Testdateien; Orchestrator prüft ausschließlich passende generierte Änderungen.
- [ ] `task test:changed`, `task freshness:regenerate`, Artefakte committen, dann `task freshness:check` ausführen. Erwartet grüne betroffene Suiten und kein Baselinewachstum.
- [ ] `task workspace:validate` und relevante Manifest-Runner-IDs über `bash scripts/vda.sh oracle 'validate changed embedding deployment and knowledge ingestion manifests'` auflösen und ausführen.
- [ ] Reale Smoke-Evidenz des Orchestrators muss alle aktiven Gemma-Backends mit 768d, Mean-Pooling und Prefixvertrag belegen. Reindex-Receipts enthalten Quell-/Zielcounts, Profilfingerprint und vollständige Coverage, einschließlich unveränderter Datei-Inhalte. Ohne diese Receipts bleibt der aktive BGE-Pfad bestehen.
- [ ] Keine neue explizite `any`-Verwendung, keine Host-/Brandliterale und keine unverbundenen neuen Skripte; Kontrolllauf nach Rebase erneut durchführen.
