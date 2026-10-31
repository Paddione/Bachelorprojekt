---
title: Dense-Consumer und additive 768D-Migration
status: pending
domains: [website, knowledge, scripts, database]
depends_on: [p1]
---
# embeddinggemma-dense-768 — Consumer und Migration

## Zweck und unveränderliche Verträge

Arbeitsverzeichnis: `/home/patrick/.worktrees/Bachelorprojekt-37ac27be/feature/embeddinggemma-dense-768`.
Vor jedem Shell-Aufruf `export AGENT_LOCK_SID=codex-embeddinggemma-20261026` setzen. Aktuelle Basis beim Implementierungsstart mit `git -C "$PWD" rev-parse HEAD` in der Evidenz erfassen.
Dieser Partial besitzt Runtime-Code und Datenmigration, keine Testdateien. Teständerungen und rot-grün-Nachweis liegen in p3. BGE-Reranker, LFM-Dense und ColBERT werden nicht verändert.

P1 stellt `scripts/lib/dense-embedding.mjs` und `.d.mts` bereit:

- `DENSE_MODEL = 'embeddinggemma-300m'`, `DENSE_DIMENSIONS = 768`, `DENSE_PROFILE = 'embeddinggemma-300m:768:Q8_0:v1'`, `DENSE_MAX_TOKENS = 2048`.
- `formatDenseInput(text, purpose, title?)` für `purpose: 'query' | 'index'`; rohe Texte genau einmal formatieren. Der Proxy präfixiert nicht.
- `assertDenseVectors(vectors, expectedCount): void` prüft Anzahl, 768 Dimensionen, endliche Zahlen und nichtleere/nichtnullige Vektoren.
- `splitDenseText(text, { tokenize, purpose: 'index', maxTokens: 2048 }): Promise<string[]>`; `tokenize(formattedText)` liefert echte Anzahl inklusive Special Tokens. Rückgabe bewahrt den vollständigen Quelltext, keine stille Kürzung.
- Separater vorbereitender Gemma-Service `llm-gateway-gemma-embed`; die bisherige BGE-Rolle bleibt bis zum geprüften Cutover erreichbar. Die Zieladresse kommt aus `DENSE_MIGRATION_EMBED_URL`, nie aus einem eingebrannten Hostnamen.

Alle Query-Consumer senden `X-LLM-Purpose: query`, Writer `index`. Ein falscher Modell-/Profil-/Dimensionswert ist ein harter Fehler, niemals Padding, Abschneiden oder stilles Neuetikettieren alter Vektoren. Die gemeinsame Formatierung wird nicht in einer zweiten Implementierung kopiert.

## File Structure

Modify:
- `components/website/src/lib/embeddings.ts`
- `components/website/src/lib/knowledge-db.ts`
- `components/website/src/lib/ingest-json-core.ts`
- `components/website/src/lib/sdlc/codesearch-db.ts`
- `components/website/src/lib/coaching-questionnaire-insights.ts`
- `components/website/src/pages/sdlc/api/ki/embeddings.ts`
- `components/website/src/lib/tickets-db.ts`
- `components/website/src/lib/tickets-embed.ts`
- `components/website/src/lib/tickets/tables/tickets.ts`
- `scripts/index-repo.ts`
- `scripts/knowledge/lib-knowledge-pg.mjs`
- `scripts/knowledge/lib-knowledge-pg.d.ts`
- `scripts/knowledge/lib-context-retrieve.mjs`
- `scripts/knowledge/search-similar.mjs`
- `scripts/knowledge/ingest-markdown.mjs`
- `scripts/knowledge/ingest-prs.mjs`
- `scripts/knowledge/ingest-bug-tickets.mjs`
- `scripts/knowledge/ingest-context7.mjs`
- `scripts/knowledge/ingest-web.mjs`
- `scripts/knowledge/reindex.sh`

Create:
- `components/website/src/lib/dense-embedding-guard.ts` — kleiner DB-Profil-/Writer-Gate-Adapter, keine Rückimporte auf Website-Client/Knowledge-Schicht.
- `scripts/knowledge/dense-client.d.mts` — strikte Typdeklarationen für TS-Consumer des neuen JS-Clients.
- `scripts/knowledge/dense-client.mjs` — Gemma-Transport, echtes Tokenisieren, Subchunk-Vorbereitung und Vektorprüfung.
- `scripts/knowledge/dense-migration-control.mjs` — Statusschema, Writer-Sperren, Shadow-DDL, Coverage-Prüfung, atomare Swap-/Rollback-Transaktion.
- `scripts/knowledge/dense-reindex-knowledge.mjs` — gespeicherte Knowledge-Chunktexte in neue Unterchunks einbetten.
- `scripts/knowledge/dense-reindex-code.mjs` — gespeicherte Code-Chunktexte in neue Unterchunks einbetten.
- `scripts/knowledge/dense-migration.mjs` — kleiner Operator-CLI und Evidenzmanifest.

Nicht ändern: `scripts/mcp/cbm-embed-store.py`, `scripts/mcp/cbm-embed-sync.py` und deren LFM-JSONL-Artefakte. Keine historischen SQL-Migrationen umschreiben. Keine Tests, generierten Inventare, Infra-/Loadout-/MCP-Dateien in diesem Partial; diese gehören p1/p3/p4.

## S1-Budgets und Struktur

Messung: 2026-10-26 auf dem oben genannten Worktree, `wc -l`, Baseline-Keys `S1:<path>` und `docs/code-quality/gates.yaml`. Alle unten aufgeführten bestehenden Dateien sind nicht baselined. Wirksame Schwelle daher Extension-Limit, keine Baseline-Ausnahme.

| Datei | Ist | Baseline | Wirksame Schwelle | Budget |
|---|---:|---|---:|---:|
| `components/website/src/lib/embeddings.ts` | 126 | — | 900 | 774 |
| `components/website/src/lib/knowledge-db.ts` | 448 | — | 900 | 452 |
| `components/website/src/lib/ingest-json-core.ts` | 108 | — | 900 | 792 |
| `components/website/src/lib/sdlc/codesearch-db.ts` | 188 | — | 900 | 712 |
| `components/website/src/lib/coaching-questionnaire-insights.ts` | 276 | — | 900 | 624 |
| `components/website/src/pages/sdlc/api/ki/embeddings.ts` | 62 | — | 900 | 838 |
| `components/website/src/lib/tickets-db.ts` | 19 | — | 900 | 881 |
| `components/website/src/lib/tickets-embed.ts` | 163 | — | 900 | 737 |
| `components/website/src/lib/tickets/tables/tickets.ts` | 540 | — | 900 | 360 |
| `scripts/index-repo.ts` | 446 | — | 900 | 454 |
| `scripts/knowledge/lib-knowledge-pg.mjs` | 177 | — | 800 | 623 |
| `scripts/knowledge/lib-knowledge-pg.d.ts` | 58 | — | 900 | 842 |
| `scripts/knowledge/lib-context-retrieve.mjs` | 279 | — | 800 | 521 |
| `scripts/knowledge/search-similar.mjs` | 94 | — | 800 | 706 |
| `scripts/knowledge/ingest-markdown.mjs` | 116 | — | 800 | 684 |
| `scripts/knowledge/ingest-prs.mjs` | 85 | — | 800 | 715 |
| `scripts/knowledge/ingest-bug-tickets.mjs` | 97 | — | 800 | 703 |
| `scripts/knowledge/ingest-context7.mjs` | 196 | — | 800 | 604 |
| `scripts/knowledge/ingest-web.mjs` | 271 | — | 800 | 529 |
| `scripts/knowledge/reindex.sh` | 43 | — | 800 | 757 |

Neue Deklaration `dense-client.d.mts`: `.mts`-Schwelle 800, Ziel höchstens 100 Zeilen. Neue Module: `.ts`-Schwelle 900, Ziel höchstens 180 Zeilen für `dense-embedding-guard.ts`; `.mjs`-Schwelle 800, Ziele `dense-client` 240, `dense-migration-control` 380, beide Reindex-Module jeweils 300, CLI 220. Neue Module erhalten jeweils erhebliche Wachstumsreserve. `knowledge-db.ts` bleibt unter 600, `index-repo.ts` unter 600 und Ticket-Tabellenmodul unter 650. Falls zusätzliche Logik diese Ziele überschreitet, echte Extraktion in die hier aufgeführten Module statt kosmetischen Zeilenkomprimierens. Keine Erhöhung der expliziten `any`-Anzahl. DB-Guard und Transport bleiben gerichtete Blattmodule, keine neuen Importzyklen.

## Task 1 — Consumer-Profil und fehlergeschlossene Grenzen

- [ ] `embeddings.ts` importiert die p1-Konstanten/-Funktionen. Export `EmbeddingModel = typeof DENSE_MODEL`; Defaults und zulässige aktive API-Auswahl werden Gemma. `resolveModelId` darf ein altes `bge-m3` nicht still auf Gemma umbiegen. Explizit übergebene fremde Modelllabels werden abgewiesen. `LLM_EMBED_MODEL` wird gegen das aktive Profil geprüft, statt beliebig an einen Single-Model-Server durchgereicht zu werden.
- [ ] `callRouter` formatiert Query und Dokument nach Purpose, validiert jede Antwort einschließlich Count und Dimension und sendet den passenden Header. Fehlende/duplizierte/nichtnumerische/Null-Vektoren sind Query-/Index-Fehler. `embedBatch` behält ein Ergebnis pro Eingabetext; lange Texte werden hier nicht still in mehrere Ergebnisse verwandelt. Writer führen Subchunking vor dem Aufruf aus. Zu lange Queries werden explizit abgelehnt, nicht gekürzt.
- [ ] `dense-client.mjs` mit deckungsgleichen Typdeklarationen in `.d.mts` exportiert `makeDenseClient({ url, fetchImpl, timeoutMs })` mit `tokenize(formattedText)`, `embedQueries(texts)` und `embedDocuments(parts)`; Rückgaben `{ embeddings, tokens, model: DENSE_MODEL, profile: DENSE_PROFILE }`. Reale `/tokenize`-Abfrage mit `add_special: true`, dann gemeinsame Formatierung genau einmal. `prepareDenseChunks(chunks, client)` verwendet `splitDenseText` und liefert `{ position, text, metadata, sourcePosition, partIndex }`, ohne Source-Coverage zu verlieren. Transporte verwenden konfigurierbare endliche Timeouts und kleine sequenzielle Batches auf CPU; Fehlantworten stoppen den Lauf.
- [ ] Alle direkten HTTP-Query-Pfade in `codesearch-db.ts`, `lib-context-retrieve.mjs` und `search-similar.mjs` verwenden den gemeinsamen Vertrag; insbesondere fehlenden Query-Purpose im Context-Retrieval beheben. Cache-Key im Context-Retrieval enthält `DENSE_PROFILE` und exakten formatierten Querytext.
- [ ] `dense-embedding-guard.ts` exportiert typisierte `assertActiveDenseProfile(pool)` und `withDenseWrite<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T>`; Letzteres prüft DB-Zustand innerhalb derselben Transaktion wie den Write. Laufende Migration liefert einen expliziten vorübergehenden Fehler; unbekannter oder alter aktiver Vektorraum ist ein Profilfehler. Für Tests Pool/Client strukturell typisieren, kein `any`.
- [ ] `knowledge-db.queryNearest` und `codesearch-db.searchCode` prüfen aktives Profil vor Embedding/SQL. Collection-Metadaten müssen das aktive Profil bestätigen; gemischte oder alte Collections nicht umetikettieren. Gemeinsame Model-/Dimensionsprüfung auch vor allen Vektorschreibvorgängen.

Akzeptanzfälle für p3: Query und Index erhalten unterschiedliche exakte Prompts und denselben Profilwert; bereits formatierte interne API-Verwendung wird vermieden; 1024D/767D/NaN/Null- oder Count-Mismatch scheitert vor SQL; alte Collection bei neuem Server bleibt fail-closed; fehlendes `LLM_EMBED_URL` bleibt Konfigurationsfehler; der Proxy verändert die Eingabe nicht zusätzlich.

## Task 2 — Bestehende Writer, Caches und Legacy-Konsistenz

- [ ] `lib-knowledge-pg.mjs` nutzt `dense-client`; `ensureCollection` schreibt Profil nur für eine neu angelegte Collection oder prüft bestehendes Profil. Eine bestehende BGE-Collection während des Shadow-Laufs nicht auf Gemma ändern. `upsertDocumentAndChunks` behält seine bestehende Transaktion/Rollback-Garantie und prüft Writer-Gate sowie Vektoren vor Ersetzen der alten vollständigen Chunks.
- [ ] Alle fünf `ingest-*.mjs` verwenden vor Embedding/Insert `prepareDenseChunks`; Positionsindizes nach Subchunking neu vergeben, Metadaten aus dem Quellchunk beibehalten, `embedding_model` und Profil korrekt setzen. Rückgaben/Anzahl dürfen nicht mehr mit der ursprünglichen Rohchunk-Anzahl verwechselt werden. Nur textuelle Trainings-/Prompt-Wrapper werden gesendet, gespeichert wird der rohe Dokumenttext.
- [ ] `ingest-json-core` erzeugt pro eingehendem JSON-Eintrag alle nötigen Teilchunks mit `source_id`/Part-Provenienz und konsistenter Position. Collection-Label erst mit erfolgreicher vollständiger Transaktion setzen; kein Modellwechsel vor Netzwerk-/Insert-Erfolg. `knowledge-db.upsertChunks` entsprechend Gate und Count-Prüfung nutzen.
- [ ] `index-repo.ts` nutzt `DENSE_DIMENSIONS`, gemeinsames Dokumentformat und tokengeprüfte Teilchunks. Datei-Inkrementalität mit `sha256(DENSE_PROFILE + NUL + contentHash)` statt reinem Inhaltshash; Migration und Indexer verwenden exakt dieselbe Profilhash-Funktion. Nach Modell-/Promptwechsel ist kein stiller Hash-Skip erlaubt. Vorhandene 1024D-Tabelle nicht durch `CREATE IF NOT EXISTS` als erfolgreich migriert ausgeben; stattdessen expliziter Migrationsfehler mit CLI-Hinweis. Indexer und Code-Query prüfen dieselbe aktive Generation.
- [ ] Admin-Embedding-API akzeptiert/zeigt ausschließlich das aktive Gemma-Dense-Modell und `fallback: null`. Vorhandene BGE-Settings beim Anzeige-/Cutover-Pfad kontrolliert ersetzen, nicht als zulässigen alternativen Vektorraum behalten.
- [ ] Coaching-Insights nutzt das gemeinsame Modellprofil. Cache-Key enthält Profil oder ein gelesener Payload mit falschem `embeddingModel` wird verworfen; beim Cutover den abgeleiteten alten Cache invalidieren. Es werden keine 1024D-Cluster mit 768D-Vektoren weiterverwendet.
- [ ] Legacy-Ticketfunktionen typkonsistent halten: `ticketEmbeddingModel` liefert die gemeinsame aktive Modellkonstante; SQL-Casts und Table-/Function-DDL verwenden gemeinsame Dimension. Keine retired Ticket-Consumer reaktivieren und keine historischen SQL-Dateien ändern. Die operative Migration darf die aktuell leere `tickets.ticket_embeddings` auf 768D umstellen; vor jeder solchen Aktion Anzahl erneut prüfen und bei nichtleerer Tabelle ohne zusätzlichen gesonderten Reindex abbrechen.
- [ ] `reindex.sh` erhält einen erreichbaren `dense-migration`-Pfad, der das neue CLI aufruft. Bisheriges `SOURCE=all` bleibt dokumentiert als Quellen-Ingest; es ist kein vollständiger Modell-Reindex, weil Custom-/Web-/Coaching-Bestände fehlen. Neue Runtime-Module sind durch direkte CLI-/Import-Wiring erreichbar (S4).

Akzeptanzfälle für p3: unveränderte Datei mit altem Profil wird neu eingebettet; identisches neues Profil erlaubt Skip. Fehler bei letztem Chunk erhält alten kompletten Dokumentbestand samt Modelllabel. Emoji-/Code-/Deutschtexte werden nach echter Tokenzahl getrennt und exakt rekonstruiert. Coaching-Cache aus BGE wird nicht ausgeliefert. Leere Legacy-Tickettabelle migriert, nichtleere führt zum expliziten Preflight-Abbruch.

## Task 3 — Additive Shadow-Migration mit nachprüfbarer Vollständigkeit

CLI: `node scripts/knowledge/dense-migration.mjs prepare|reindex|verify|cutover|rollback|status --run-id <id>`.
`prepare`, `cutover`, `rollback` unterstützen `--dry-run`. Alle Aktionen lesen die Ziel-DB aus `PGURL`; CLI protokolliert niemals dessen Wert oder Passwörter. `DENSE_MIGRATION_EMBED_URL` ist nur für das separate vorbereitete Gemma-Backend. Eine Run-ID wird strikt als ungefährlicher Identifier geprüft, SQL-Identifier werden zusätzlich identifier-sicher erzeugt. Kein SQL-String aus ungeprüfter CLI-Eingabe.

- [ ] `dense-migration-control.mjs` legt additiv `public.dense_embedding_migrations` mit Run-ID, Quell-/Zielprofil, Phase, Zähler/Fingerprints und Zeitstempeln an. Felder `writer_locked boolean`, `active boolean`, `source_profile text`, `target_profile text`, `source_fingerprint text` sowie JSONB-Zähler/Manifest explizit modellieren; ein partieller Unique-Index erlaubt nur eine aktive Generation und eine aktive Writer-Sperre. Statusübergänge: `prepared -> indexing -> verified -> active`; Fehler bleiben explizit fehlgeschlagen, nie aktiv. Aktive Rolle und aktuelle Generation werden getrennt vom Zielprofil gespeichert.
- [ ] Preflight inventarisiert aktuelle Tabellen/Spaltentypen/HNSW-Indizes, Collection-Modelle, eingehende Fremdschlüssel und Writer. Momentaufnahme: 4.954 Knowledge-Chunks, 25.983 Code-Zeilen, 0 Ticket-Embeddings sind lediglich der bekannte Anfangsbefund; tatsächliche Zahlen und Quellhashes pro Lauf neu erheben. Fehlende Tabellen sind explizit zu melden; keine leere Migration als Vollerfolg ausgeben.
- [ ] `prepare` erzeugt `knowledge.chunks_gemma_<run>` und `public.code_embeddings_gemma_<run>` mit `embedding vector(768)` und profilbewussten Metadaten. Explizite PK/Unique-/FK-/Indexdefinitionen und Grants vom Quellschema übernehmen; nicht auf `CREATE TABLE LIKE` als vermeintliche FK-Kopie vertrauen. Knowledge-Zeilen tragen `source_chunk_id`, `part_index`, `source_hash`, Original-Collection/Document und rohe Teiltexte. Code-Zeilen tragen Quellzeilen-ID, Datei, ursprünglichen Chunk-Index, Part-Index, Profil-Dateihash und neuen eindeutigen Chunk-Index pro Datei. Nicht allein ein zweites Vektorfeld pro Originalzeile anlegen: >2048 Tokens erfordern 1:n Zeilen.
- [ ] Vor Source-Snapshot Writer-Gate aktivieren. DB-seitige Trigger schützen die kanonischen Knowledge-/Code-Vektortabellen UND relevante Dokument-/Collection-Mutationen, damit auch noch nicht aktualisierte Cron-/App-Writer abgewiesen werden. Eine bloße App-Env-Variable oder eine nur freiwillige Advisory-Sperre reicht nicht. Sperre und Quellfingerprint werden gemeinsam transaktional erfasst; Trigger-Bypass nur für die explizite Migrationssession. Bestehende BGE-Lesewege können während Shadow-Aufbau weiter aus der unveränderten Quelle lesen.
- [ ] `dense-reindex-knowledge.mjs` liest alle vorhandenen Quell-Chunks, nicht nur erneut abrufbare Quellen. So bleiben Custom-, Web-, Context7- und Coaching-Daten erhalten. Originaltext pro Quellchunk über `splitDenseText` vollständig zerlegen, sämtliche Teilchunks einbetten und pro Source-ID transaktional in die Shadow-Tabelle schreiben. Checkpoint nur nach vollständigem Commit; Resume prüft Run-/Profil-/Quellhash und aktualisiert niemals einen anderen Run.
- [ ] `dense-reindex-code.mjs` erledigt denselben vollständigen Durchlauf für gespeicherte Code-Chunks. Aufstiegsregel für Chunk-Indizes ist stabil: Quellindex, dann Part-Index, fortlaufend je Datei. Das vorhandene `file_dependencies` bleibt unverändert. Leere Texte/ungültige Eingaben sind explizite Quellfehler, kein stiller Skip; ein Fehler verhindert `verified`.
- [ ] Manifest enthält Quellanzahl, Teilchunk-Anzahl, vollständige Source-ID-Coverage, profilgebundenen Inhaltsfingerprint, Modell-/Runtime-Identität, Run-ID und Fehlerzahl. Dokumente/Collections ohne Chunks bleiben erhalten; keine unbeabsichtigte Löschung aus fehlender Parser-Coverage.
- [ ] `verify` prüft: jede Quellzeile hat mindestens einen passenden Teilchunk; keine unbekannten Source-IDs; Parts rekonstruieren Quelltext exakt; Positionen/Unique-Keys korrekt; alle Vektoren 768D/finite/nichtnull; alle Schattenzeilen Zielprofil; Originalfingerprint ist weiterhin gleich. Neue HNSW-Indizes vor Cutover mit eindeutigen Run-Namen aufbauen und `ANALYZE` ausführen. Erkennbare Null-/NaN-Daten werden zusätzlich in SQL geprüft. Bei Drift fehlgeschlagen/erneut indizieren, nicht die Messbasis nachträglich umschreiben.

Akzeptanzfälle für p3: Fake-Tokenizer mit schwierigen Unicode-Texten, >2048-Token-Quelle, Resume nach mittlerem Netzwerkfehler, Abbruch bei Source-Drift, Null-/Fremdprofil-/Coverage-Fehler. Native pgvector-Integration prüft realen Spaltentyp, Dimension-Cast, Constraints, Grants und Indexnutzungsvoraussetzungen.

## Task 4 — Atomarer Cutover und wiederherstellbarer Rückfall

- [ ] `cutover --dry-run` meldet nur geplante Änderungen, aktualisiert weder Gate noch Tabelle. Echtes `cutover` akzeptiert ausschließlich denselben bereits `verified`-Run mit vollständigem Manifest und unveränderter Quelle. Endpunkte/App-/Cron-Konfigurationsbundle von p1 muss vorbereitet sein; Vorbereitung allein verändert die bisherige `embed`-Fallback-Kette nicht.
- [ ] Finalisierung in einer DB-Transaktion mit expliziter Advisory- und Tabellen-Sperre: Source-Fingerprint/Coverage nochmals prüfen; kanonische Tabellen zu eindeutigen `*_bge_backup_<run>` umbenennen; verifizierte Shadow-Tabellen auf kanonische Namen setzen; Index-/Constraintnamen kollisionsfrei behandeln; Knowledge-Collection-Labels und Chunk-Zähler auf Gemma setzen; aktive Generation/Profil aktualisieren; abgeleitete Modellcaches invalidieren. Scheitert ein Schritt, komplette Transaktion zurückrollen.
- [ ] Unbekannte eingehende Fremdschlüssel auf umzubenennende Quelltabellen führen im Preflight zum Abbruch statt still weiter auf Backup-Tabellen zu zeigen. Bekannte ausgehende Knowledge-FKs müssen nach Swap unverändert auf bestehende Dokumente/Collections zeigen. Alte Tabellen und Originalmetadaten sind vollständiger Rückfallbestand, nicht `DROP`/`TRUNCATE`.
- [ ] Endpoint-/App-Umschaltung und DB-Swap sind nicht systemübergreifend atomar. Deshalb bleibt das Writer-Gate bis zum verifizierten neuen Konfigurationsbundle aktiv; neue Consumer prüfen DB-Profil und Endpunktantwort und liefern während einer Übergangsphase Fehler statt Mischraum-Ergebnisse. P1 schaltet alle `embed`-Kettenglieder gemeinsam auf Gemma; kein BGE-Fallback für Gemma-Queries. Danach Smoke-Abfragen/Writer-Probe mit 768D und Zielprofil, erst dann Gate freigeben und Ingest-Cron wieder aufnehmen. Kein ungeprüftes direktes Prod-Deploy aus diesem Partial.
- [ ] `rollback --run-id` prüft unveränderte/vollständige Backup-Generation und passende alte Runtime-Konfiguration. Sobald Gemma-Schreibvorgänge aufgenommen wurden, kann ein einfacher Tabellentausch neuere Daten verlieren: CLI verweigert deshalb den schnellen Rollback bei seit Freigabe veränderten Source-/Generation-Fingerprints. In diesem Fall ist ein expliziter Rückwärts-Reindex nötig, kein Datenverlust als Rollback verkaufen. Vor Writer-Freigabe lässt sich der Swap mitsamt Collection-Metadaten transaktional rückgängig machen. Alte Modellketten nur zusammen mit den alten Tabellen aktivieren.
- [ ] Nach Cutover Counts/Profil/Dimension/Ready-State messen, Knowledge- und Code-Suche aus demselben Profil beweisen und aktive BGE-Dense-Ketten ausschließen. Backup-Tabellen bis zu gesonderter Aufräumfreigabe behalten. BGE-Reranker und LFM/ColBERT-Identitäten mit Vorher-/Nachher-Snapshot auf Unverändertheit prüfen.

Akzeptanzfälle für p3: mitten im Swap injizierter Fehler erhält alte kanonische Tabellen, Labels und Profil; unvollständiger Run kann nie aktiv werden; Writer-Trigger blockiert auch Legacy-SQL; FK-Ziel/Grants bleiben richtig; Rollback vor Freigabe funktioniert, Rollback nach neuen Writes verweigert Datenverlust. Aktiver Query-Vektor kann ausschließlich den gleichprofilierten Index erreichen.

## Task 5 — Ausführbare Verifikation und Evidenzübergabe

Tests besitzt p3. Dort zuerst Regressionstests implementieren und auf unveränderter Runtime ausführen (expected: FAIL), anschließend nach Umsetzung grün ausführen. Konkrete Runner nach dem Repo-Oracle auflösen; die folgenden Zielaufrufe sind die Akzeptanzbefehle für die besessenen Schnittstellen:

```bash
export AGENT_LOCK_SID=codex-embeddinggemma-20261026
node --test scripts/knowledge/dense-migration.test.mjs
node --test scripts/lib/dense-embedding.test.mjs
python3 -m pytest tests/py/unit/ported/test_scs_index.py tests/py/unit/ported/test_knowledge_ingest_schema.py -q
pnpm --dir components/website exec vitest run src/lib/embeddings.test.ts src/lib/knowledge-db.test.ts src/lib/ingest-json-core.test.ts src/lib/sdlc/codesearch-db.test.ts src/lib/coaching-questionnaire-insights.test.ts src/pages/sdlc/api/ki/embeddings.test.ts
node scripts/knowledge/dense-migration.mjs status --run-id embeddinggemma-768-v1
node scripts/knowledge/dense-migration.mjs cutover --run-id embeddinggemma-768-v1 --dry-run
```

Erwartung: Unit-/Verhaltenstests Exit 0; Status nennt Zielprofil/Phase ohne Secrets; Dry-run beweist keine Änderung am Quellbestand. Native pgvector-Integration wird von p3 zusätzlich gegen eine isolierte Test-DB ausgeführt; keine Produktion als Testfixture.

Finale repo-weite Checks gehören zum letzten Test-Partial: `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task workspace:validate`, `task test:inventory`. Keine Baseline-/Ignore-Erweiterung, keine neue `any`-Verwendung. Evidenz enthält Dateibudgets, Lauf-ID, Modell-/Runtime-Revision, Testresultate und verifizierte DB-/Index-Counts. Bis zum tatsächlichen Cutover lautet Status vorbereitet, nicht ausgerollt oder neu indexiert.
