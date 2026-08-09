# llm-pipeline

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Die LLM-Pipeline umfasst drei Subsysteme: den Embedding-Layer (bge-m3 via TEI auf dem GPU-Host
sowie voyage-multilingual-2 via Voyage-API), den wissensbasierten RAG-Query-Layer (pgvector,
`MixedEmbeddingModelError`-Schutz), sowie den Chat-Router (provider_config-Tabelle, Cooldown,
Tier-basiertes Routing). Alle drei werden über den `LLM_ENABLED`-Schalter gesteuert.

---

## Requirements

### Requirement: LLM-Enabled-Schalter

The system SHALL route embedding calls through the on-cluster GPU gateway (`llm-gateway-embed`)
when `LLM_ENABLED=true`, and SHALL fall back directly to the Voyage API when `LLM_ENABLED=false`,
without any other code-path change.

#### Scenario: LLM aktiviert

- **GIVEN** `LLM_ENABLED=true` ist in der Laufzeitumgebung gesetzt
- **WHEN** `embedQuery` oder `embedBatch` aufgerufen wird
- **THEN** sendet das System den Embedding-Request an `llm-gateway-embed.workspace.svc.cluster.local:8081`

#### Scenario: LLM deaktiviert

- **GIVEN** `LLM_ENABLED=false` oder die Variable ist nicht gesetzt
- **WHEN** `embedQuery` oder `embedBatch` aufgerufen wird
- **THEN** sendet das System den Request direkt an `https://api.voyageai.com/v1/embeddings`
  mit dem Modell `voyage-multilingual-2`

---

### Requirement: Fail-Closed bei bge-m3-Netzwerkfehler

The system SHALL throw a typed `EmbeddingQueryError` (bei Queries) bzw. `EmbeddingIndexError`
(beim Indexieren) und SHALL NOT silently fall back to another embedding space when the GPU
router is unreachable and the requested model is `bge-m3`.

#### Scenario: GPU-Router nicht erreichbar, Modell bge-m3

- **GIVEN** `LLM_ENABLED=true` und der GPU-Host ist nicht erreichbar (ECONNREFUSED / ETIMEDOUT)
- **WHEN** `embedQuery` mit Modell `bge-m3` aufgerufen wird
- **THEN** wirft das System eine `EmbeddingQueryError` mit der originalen Fehlermeldung und
  führt keinen Fallback auf Voyage durch

#### Scenario: GPU-Router nicht erreichbar, Modell voyage-multilingual-2

- **GIVEN** `LLM_ENABLED=true` und der GPU-Host ist nicht erreichbar
- **WHEN** `embedQuery` mit Modell `voyage-multilingual-2` aufgerufen wird
- **THEN** fällt das System auf `callVoyageDirect` zurück und gibt ein gültiges Embedding zurück

---

### Requirement: Embedding-Batch-Verarbeitung in Chunks

The system SHALL split large document sets into batches of at most 128 texts and SHALL process
each batch sequentially, accumulating embeddings and token counts into a single `BatchResult`.

#### Scenario: Mehr als 128 Texte

- **GIVEN** `embedBatch` wird mit 300 Texten aufgerufen
- **WHEN** die Funktion ausgeführt wird
- **THEN** werden drei Batches (128 + 128 + 44) sequenziell gesendet und das Ergebnis
  enthält 300 Embeddings sowie die Summe aller Token-Counts

#### Scenario: Retry bei transientem Fehler innerhalb eines Batches

- **GIVEN** der erste HTTP-Request eines Batches gibt HTTP 503 zurück
- **WHEN** die Retry-Logik greift (max 4 Versuche, exponentielles Backoff ab 250 ms)
- **THEN** wird der Request bis zu dreimal wiederholt, bevor ein Fehler geworfen wird

---

### Requirement: Verbot von Cross-Space-Queries

The system SHALL reject `queryNearest` calls that span collections with different
`embedding_model` values by throwing `MixedEmbeddingModelError`, because vectors from
different embedding spaces cannot be compared via cosine distance.

#### Scenario: Homogene Collection-Abfrage

- **GIVEN** alle abgefragten Collections haben `embedding_model = 'bge-m3'`
- **WHEN** `queryNearest` aufgerufen wird
- **THEN** wird ein einzelnes Embedding generiert und die Vektorsuche ausgeführt

#### Scenario: Gemischte Embedding-Modelle

- **GIVEN** zwei abgefragte Collections haben unterschiedliche `embedding_model`-Werte
- **WHEN** `queryNearest` die `DISTINCT embedding_model` aus der DB liest
- **THEN** wirft das System `MixedEmbeddingModelError` mit den betroffenen Modellnamen
  und führt keine Vektorsuche durch

---

### Requirement: RAG-Ähnlichkeitsschwelle

The system SHALL filter vector search results by a cosine-similarity threshold
(Standard: 0.65) and SHALL only return chunks whose score meets or exceeds the threshold.

#### Scenario: Chunk über Schwelle

- **GIVEN** `queryNearest` findet einen Chunk mit Score 0.72
- **WHEN** das Ergebnis gefiltert wird
- **THEN** ist der Chunk im Rückgabe-Array enthalten

#### Scenario: Chunk unter Schwelle

- **GIVEN** `queryNearest` findet einen Chunk mit Score 0.58
- **WHEN** das Ergebnis gefiltert wird
- **THEN** ist der Chunk nicht im Rückgabe-Array enthalten

---

### Requirement: Prioritätsbasiertes Provider-Routing

The system SHALL select the chat provider with the lowest `priority` value for die
angeforderte `(source, tier)`-Kombination aus `tickets.provider_config`, SHALL dabei
nur `enabled = true`-Einträge berücksichtigen und SHALL Anbieter überspringen, deren
`cooldown_until` noch in der Zukunft liegt.

#### Scenario: Primärer Provider verfügbar

- **GIVEN** zwei Provider-Einträge für `(source='assistant-chat', tier='sonnet')` mit Priority 0 und 1,
  beide enabled, kein aktiver Cooldown
- **WHEN** `getProviderConfig('assistant-chat', 'sonnet')` aufgerufen wird
- **THEN** gibt das System den Eintrag mit Priority 0 zurück

#### Scenario: Primärer Provider im Cooldown

- **GIVEN** der Provider mit Priority 0 hat `cooldown_until` in der Zukunft
- **WHEN** `getProviderConfig` ausgeführt wird
- **THEN** wählt das System den Provider mit Priority 1 (nächste verfügbare Priorität)

#### Scenario: Kein Provider konfiguriert

- **GIVEN** die DB enthält keinen enabled Provider für die angefragte (source, tier)-Kombination
- **WHEN** `getProviderConfig` ausgeführt wird
- **THEN** gibt das System den Anthropic-Fallback (`claude-sonnet-4-6`) mit dem
  `ANTHROPIC_API_KEY` aus der Umgebung zurück

---

### Requirement: Automatischer Provider-Cooldown bei Fehler

The system SHALL set a cooldown for a provider in `tickets.provider_health` when a
chat-request fails, so that subsequent calls automatically skip that provider until the
cooldown expires.

#### Scenario: Fehler beim Chat-API-Call

- **GIVEN** `client.messages.create` wirft einen Fehler
- **WHEN** `assistantChat` den Fehler fängt
- **THEN** ruft das System `setProviderCooldown(pool, source, provider, 5)` auf und
  `cooldown_until` wird auf `now() + 5 minutes` in der DB gesetzt, bevor der Fehler
  re-thrown wird

---

### Requirement: RAG-Kontext-Anreicherung im Assistent-Chat

The system SHALL augment the system prompt with relevant book passages retrieved via
`queryNearest` when `context.useBooks === true`, and SHALL proceed without passages
(graceful degradation) if the RAG lookup fails.

#### Scenario: Buchpassagen gefunden

- **GIVEN** `context.useBooks === true` und die Coaching-Collections enthalten passende Chunks
- **WHEN** `assistantChat` ausgeführt wird
- **THEN** enthält der System-Prompt die Passagen als `<Quellenpassagen>`-Block und
  das Rückgabe-Objekt enthält ein `sources`-Array mit Index, Buchtitel, Seite und Excerpt

#### Scenario: RAG-Lookup schlägt fehl

- **GIVEN** `context.useBooks === true` aber `queryNearest` wirft einen Fehler
- **WHEN** `assistantChat` ausgeführt wird
- **THEN** loggt das System den Fehler, fährt ohne Passagen fort und gibt eine Chat-Antwort
  ohne `sources` zurück

---

### Requirement: SCS-Indexer-Schema mit code_embeddings und file_dependencies

The system SHALL create a `code_embeddings` table (with a `UNIQUE(file_path, chunk_index)`
constraint and an `ivfflat` index for cosine similarity) and a `file_dependencies` table
in the repository indexer (`scripts/index-repo.ts`), using vector dimension `EMBED_DIM`
(1024 for bge-m3) for all embedding columns.

#### Scenario: Schema-Erstellung beim ersten Indexlauf

- **GIVEN** `scripts/index-repo.ts` wird auf einer leeren Datenbank ausgeführt
- **WHEN** das DDL ausgeführt wird
- **THEN** existieren die Tabellen `code_embeddings` (mind. 3 Referenzen) und
  `file_dependencies` (mind. 2 Referenzen) mit einem `UNIQUE(file_path, chunk_index)`-Constraint
  und einem `ivfflat`-Index für Cosine-Similarity

#### Scenario: Duplikate werden durch UNIQUE-Constraint verhindert

- **GIVEN** dieselbe Datei wird zweimal indexiert (z. B. nach einer Änderung)
- **WHEN** der Indexer einen `INSERT … ON CONFLICT`-Upsert ausführt
- **THEN** verhindert der `UNIQUE(file_path, chunk_index)`-Constraint doppelte Zeilen und
  aktualisiert stattdessen den bestehenden Eintrag

---

### Requirement: SCS-Indexer bge-m3-Modell und Embedding-Dimension

The system SHALL use the model `bge-m3` for all code embeddings and SHALL reference
`EMBED_DIM` (not a hardcoded literal) wherever the vector dimension is specified in
the schema or embedding calls.

#### Scenario: Embedding-Modell ist bge-m3

- **GIVEN** `scripts/index-repo.ts` wird ausgeführt
- **WHEN** Embeddings für Code-Chunks erzeugt werden
- **THEN** verwendet das System das Modell `bge-m3` für alle Embedding-Requests

#### Scenario: Vektordimension über EMBED_DIM-Konstante

- **GIVEN** das Schema und Embedding-Aufrufe in `scripts/index-repo.ts`
- **WHEN** der Quelltext auf hardkodierte Dimensionen geprüft wird
- **THEN** wird die Dimension ausschließlich über die Konstante `EMBED_DIM` (mind. 2 Referenzen)
  referenziert, sodass eine Modellumstellung nur eine einzige Stelle ändert

---

### Requirement: SCS-Indexer Inkrementell-Reindex via SHA-256 und --file-Flag

The system SHALL support incremental re-indexing by computing a SHA-256 hash of each
file and SHALL accept a `--file` flag to restrict indexing to a single specified file,
skipping unchanged files detected via hash comparison.

#### Scenario: Nur geänderte Dateien werden neu indexiert

- **GIVEN** eine Datei wurde seit dem letzten Indexlauf nicht verändert
- **WHEN** `scripts/index-repo.ts` ohne `--file`-Flag ausgeführt wird
- **THEN** vergleicht das System den gespeicherten SHA-256-Hash mit dem aktuellen und
  überspringt unveränderte Dateien

#### Scenario: Einzeldatei-Reindex via --file-Flag

- **GIVEN** `scripts/index-repo.ts` wird mit dem Flag `--file <pfad>` aufgerufen
- **WHEN** der Indexlauf startet
- **THEN** indexiert das System ausschließlich die angegebene Datei und ignoriert alle anderen

---

### Requirement: SCS-Indexer ignoriert node_modules und dist

The system SHALL exclude the directories `node_modules` and `dist` from indexing so
that third-party and build artifacts are never stored in `code_embeddings`.

#### Scenario: node_modules wird ausgeschlossen

- **GIVEN** das Repository enthält ein `node_modules`-Verzeichnis mit TypeScript-Dateien
- **WHEN** `scripts/index-repo.ts` ausgeführt wird
- **THEN** enthält der Indexlauf keine Dateien aus `node_modules`

#### Scenario: dist-Verzeichnis wird ausgeschlossen

- **GIVEN** das Repository enthält ein `dist`-Verzeichnis mit kompilierten Dateien
- **WHEN** `scripts/index-repo.ts` ausgeführt wird
- **THEN** enthält der Indexlauf keine Dateien aus `dist`

---

### Requirement: SCS-Indexer YAML-Chunking und Import-Extraktion

The system SHALL chunk YAML files separately from source code (via `chunkYaml`) and
SHALL extract import statements from source files (via `extractImports`) to populate
the `file_dependencies` table for dependency-graph traversal.

#### Scenario: YAML-Dateien werden separat gechunkt

- **GIVEN** das Repository enthält YAML-Manifeste (z. B. `k3d/*.yaml`)
- **WHEN** `scripts/index-repo.ts` diese Dateien verarbeitet
- **THEN** ruft der Indexer `chunkYaml` auf (mind. 1 Referenz) und speichert die
  YAML-Chunks als separate Einträge in `code_embeddings`

#### Scenario: Imports werden für den Dependency-Graph extrahiert

- **GIVEN** eine TypeScript-Quelldatei mit mehreren `import`-Statements
- **WHEN** `scripts/index-repo.ts` die Datei indexiert
- **THEN** ruft der Indexer `extractImports` auf (mind. 1 Referenz) und trägt die
  ermittelten Abhängigkeiten in `file_dependencies` ein

---

### Requirement: SCS-Such-API mit Admin-Auth und Query-Validierung

The system SHALL expose a code-search API endpoint (`website/src/pages/api/codesearch.ts`)
that requires admin authentication (`isAdmin` check) and SHALL validate the query parameter
`q` before executing any database search.

#### Scenario: Nicht-Admin-Zugriff wird abgelehnt

- **GIVEN** ein Benutzer ohne Admin-Rolle sendet einen Request an `/api/codesearch`
- **WHEN** die API den Request verarbeitet
- **THEN** prüft die API `isAdmin` (mind. 1 Referenz) und lehnt den Request ab,
  ohne eine DB-Abfrage auszuführen

#### Scenario: Fehlender Query-Parameter wird abgelehnt

- **GIVEN** ein Admin-Benutzer sendet einen Request ohne den Parameter `q`
- **WHEN** die API `searchParams.get('q')` auswertet
- **THEN** gibt die API einen Fehler zurück und führt keine Vektorsuche durch

---

### Requirement: SCS-Such-API 503 bei nicht erreichbarem Embedding-Service

The system SHALL return HTTP 503 with the message `embedding service unavailable` when
the embedding service cannot be reached during a code search request, so that callers
can distinguish service outages from query errors.

#### Scenario: Embedding-Service nicht erreichbar

- **GIVEN** der Embedding-Service (bge-m3 via GPU-Gateway) ist nicht erreichbar
- **WHEN** `/api/codesearch` einen Search-Request verarbeitet
- **THEN** antwortet die API mit HTTP 503 und der Meldung `embedding service unavailable`

---

### Requirement: SCS-Augmented-Search mit 1-Hop-Dependency-Neighbors

The system SHALL provide a `searchCodeAugmented` function in `codesearch-db.ts` that,
after a standard vector search, queries `file_dependencies` for 1-hop neighbors of
matched files and includes those neighbor files in the result with a fixed score of 0.7.

#### Scenario: Direkttreffer mit Dependency-Nachbarn

- **GIVEN** eine Vektorsuche findet Datei A mit Score 0.85
- **WHEN** `searchCodeAugmented` die `file_dependencies`-Tabelle für 1-Hop-Nachbarn abfragt
- **THEN** enthält das Ergebnis sowohl Datei A (mit originalem Score) als auch alle
  direkten Abhängigkeiten von A mit `score: 0.7`

#### Scenario: Keine Abhängigkeiten vorhanden

- **GIVEN** eine Vektorsuche findet Datei B, die keine Einträge in `file_dependencies` hat
- **WHEN** `searchCodeAugmented` nach 1-Hop-Nachbarn sucht
- **THEN** enthält das Ergebnis ausschließlich Datei B ohne zusätzliche Neighbor-Einträge

---

### Requirement: SCS-Factory-Pipeline-Integration mit Graceful Degradation

The system SHALL query the code search API during the Scout phase of the factory pipeline
(`scripts/factory/pipeline.js`) and SHALL degrade gracefully (via try/catch) when the
SCS is unavailable, so that ticket processing continues without suggested files.

#### Scenario: SCS-Abfrage im Scout-Phase erfolgreich

- **GIVEN** der Embedding-Service ist erreichbar und `codesearch` gibt Treffer zurück
- **WHEN** die Factory-Pipeline die Scout-Phase für ein Ticket ausführt
- **THEN** enthält das Ticket-Objekt ein `suggested_files`-Feld mit den relevanten Dateipfaden
  und Scores aus der Vektorsuche

#### Scenario: SCS nicht erreichbar — Pipeline läuft weiter

- **GIVEN** der Embedding-Service ist nicht erreichbar
- **WHEN** die Factory-Pipeline die Scout-Phase ausführt und `codesearch` fehlschlägt
- **THEN** fängt `pipeline.js` den Fehler (graceful degradation, mind. 1 Referenz) und
  führt die Pipeline ohne `suggested_files` fort

---

### Requirement: SCS-UI — suggested_files in DetailPanel mit Score-Farbe

The system SHALL display `suggested_files` in the `DetailPanel.svelte` component and
SHALL color-code the relevance scores via a `scoreColor` function so that developers
can visually distinguish high-relevance from low-relevance file suggestions.

#### Scenario: Ticket mit suggested_files wird angezeigt

- **GIVEN** ein Ticket-Objekt enthält ein `suggested_files`-Array (mind. 2 Referenzen im
  `TicketDetail`-Typ in `factory-floor.ts` und mind. 2 in `DetailPanel.svelte`)
- **WHEN** `DetailPanel.svelte` das Ticket rendert
- **THEN** zeigt die Komponente den `suggested_files`-Abschnitt mit Dateipfaden und Scores an

#### Scenario: Score-Farbe unterscheidet Relevanz

- **GIVEN** zwei suggested_files mit unterschiedlichen Scores (z. B. 0.9 und 0.5)
- **WHEN** `DetailPanel.svelte` die Dateien rendert
- **THEN** liefert die `scoreColor`-Funktion (mind. 1 Referenz) unterschiedliche Farben
  für hohe und niedrige Scores

---

### Requirement: SCS-Post-Commit-Hook für automatisches inkrementelles Indexieren

The system SHALL provide an executable git post-commit hook (`.githooks/post-commit-index`)
that filters committed files by indexable extensions (`ts`, `svelte`, `astro`, `yaml`)
and triggers incremental re-indexing via `scripts/index-repo-incremental.sh` for
matching files.

#### Scenario: Commit mit indexierbaren Dateien löst Reindex aus

- **GIVEN** ein Commit enthält geänderte `.ts`- oder `.svelte`-Dateien
- **WHEN** der git post-commit Hook `.githooks/post-commit-index` ausgeführt wird
- **THEN** filtert der Hook nach den Erweiterungen `ts|svelte|astro|yaml` (mind. 1 Referenz)
  und startet `scripts/index-repo-incremental.sh` für die betroffenen Dateien

#### Scenario: Commit ohne indexierbare Dateien — kein Reindex

- **GIVEN** ein Commit enthält ausschließlich Dateien mit nicht-indexierbaren Erweiterungen
  (z. B. `.md`, `.png`)
- **WHEN** der git post-commit Hook ausgeführt wird
- **THEN** überspringt der Hook den Reindex-Aufruf

---

### Requirement: SCS-Taskfile-Integration mit scs:index und scs:search Tasks

The system SHALL register `scs:index` and `scs:search` tasks in `Taskfile.yml` and
SHALL include `post-commit-index` in the `secrets:install-hooks` task so that the
post-commit hook is activated when the developer runs the hook-installation target.

#### Scenario: scs:index und scs:search Tasks vorhanden

- **GIVEN** `Taskfile.yml` ist das zentrale Task-Registry des Projekts
- **WHEN** `task --list` ausgeführt wird
- **THEN** sind die Tasks `scs:index` (mind. 1 Referenz) und `scs:search` (mind. 1 Referenz)
  in `Taskfile.yml` registriert

#### Scenario: post-commit-index wird durch secrets:install-hooks aktiviert

- **GIVEN** ein Entwickler führt `task secrets:install-hooks` aus
- **WHEN** der Task die konfigurierten Hooks installiert
- **THEN** verlinkt oder kopiert der Task `post-commit-index` (mind. 1 Referenz in
  `Taskfile.yml`) in das aktive `.git/hooks`-Verzeichnis

---

### Requirement: QA-Ticket-Abschluss per Slug

The system SHALL automatically set a QA-review ticket's status to `done` and activate
its feature flag when all E2E test results for its slug pass, and SHALL leave the ticket
on `qa_review` if any test for that slug fails.

#### Scenario: Alle Tests für einen Slug bestehen

- **GIVEN** Tickets im Status `qa_review` haben einen `slug_key` (z. B. `my-slug`)
- **WHEN** `closeQaTicketsBySlug` mit einer Ergebnisliste aufgerufen wird, in der alle `[my-slug]`-Tests `status: 'pass'` haben
- **THEN** setzt das System den Ticket-Status auf `done`, aktiviert das Feature-Flag in `feature_flags` und gibt die `external_id` des Tickets zurück

#### Scenario: Mindestens ein Test für den Slug schlägt fehl

- **GIVEN** Tickets im Status `qa_review` mit `slug_key = 'my-slug'`
- **WHEN** `closeQaTicketsBySlug` aufgerufen wird und ein Testergebnis `status: 'fail'` enthält
- **THEN** belässt das System das Ticket auf `qa_review`, führt kein UPDATE aus und gibt ein leeres Array zurück

#### Scenario: DB-Fehler — Fail-Closed

- **GIVEN** die Datenbankverbindung ist nicht verfügbar
- **WHEN** `closeQaTicketsBySlug` aufgerufen wird
- **THEN** fängt die Funktion den Fehler ab und gibt ein leeres Array zurück, ohne eine Exception zu propagieren

---

### Requirement: KI-Provider-Config-Datenbank (CRUD)

The system SHALL provide CRUD operations for KI provider configurations in the database,
ordering results by `(source, tier, priority)` and excluding the `coaching` source from
general `listProviders` calls, and SHALL perform no DB query when `updateProvider` is
called with no fields to change.

#### Scenario: Auflistung der Provider ohne Coaching

- **GIVEN** die `ki_provider_config`-Tabelle enthält Einträge für verschiedene Sources, darunter `coaching`
- **WHEN** `listProviders` aufgerufen wird
- **THEN** gibt die Funktion alle Einträge außer den `coaching`-Einträgen zurück, sortiert nach `source, tier, priority`

#### Scenario: UpdateProvider mit leeren Feldern ist ein No-Op

- **GIVEN** ein Provider mit id 7 existiert in der Datenbank
- **WHEN** `updateProvider(7, {})` aufgerufen wird
- **THEN** führt das System keine Datenbankabfrage aus und gibt `false` zurück

---

### Requirement: Rerank-Client mit Graceful Degradation

The system SHALL re-rank candidate documents by relevance score in descending order via the
llama.cpp reranking endpoint (`POST /v1/rerank` with `{model, query, documents}`, responding with
`{results:[{index, relevance_score}]}`) and SHALL degrade gracefully (returning all documents with
`score: 0`) when the service is disabled, unavailable, or the input is empty. Every degraded call
caused by an error or a non-OK response SHALL emit a warning log entry, so that an outage cannot
pass unnoticed.

#### Scenario: Erfolgreiches Reranking

- **GIVEN** `LLM_RERANK_ENABLED=true` und der Rerank-Server antwortet mit `results[].relevance_score`
- **WHEN** `rerankCandidates` mit einer Query und drei Kandidaten aufgerufen wird
- **THEN** gibt die Funktion die Dokumente absteigend nach `relevance_score` sortiert zurück

#### Scenario: Reranking deaktiviert

- **GIVEN** `LLM_RERANK_ENABLED=false` oder `LLM_RERANKER_URL` ist nicht gesetzt
- **WHEN** `rerankCandidates` aufgerufen wird
- **THEN** gibt die Funktion alle Eingabedokumente in Originalreihenfolge mit `score: 0` zurück,
  ohne einen Fehler zu werfen und ohne eine Warnung zu loggen

#### Scenario: Rerank-Server nicht verfügbar

- **GIVEN** `LLM_RERANK_ENABLED=true`, aber der Rerank-Server antwortet mit einem Fehlerstatus oder
  die Verbindung schlägt fehl
- **WHEN** `rerankCandidates` aufgerufen wird
- **THEN** gibt die Funktion alle Eingabedokumente mit `score: 0` zurück **und** loggt eine Warnung

---

### Requirement: Text-Chunking mit Überlappung und Markdown-Grenzen

The system SHALL split text into chunks at approximately `targetTokens` tokens with
`overlapTokens` token overlap between adjacent chunks, and SHALL prefer splitting at
markdown H2 headings when `mode: 'markdown'` is specified.

#### Scenario: Kurzer Text ergibt einen einzigen Chunk

- **GIVEN** ein Text mit weniger Tokens als `targetTokens`
- **WHEN** `chunkText` aufgerufen wird
- **THEN** gibt die Funktion genau einen Chunk mit dem gesamten Text und `position: 0` zurück

#### Scenario: Markdown-Modus — Splits bevorzugt an H2-Überschriften

- **GIVEN** ein langer Markdown-Text mit mehreren `## H2`-Überschriften
- **WHEN** `chunkText` mit `mode: 'markdown'` aufgerufen wird
- **THEN** endet der erste Chunk vor der zweiten `##`-Überschrift, und ein weiterer Chunk beginnt mit `## B`, sodass Überschriften als Schnittgrenzen bevorzugt werden

---

### Requirement: KI-Katalog als kuratierte Provider-Registry

The system SHALL maintain a typed `KI_CATALOG` that lists all supported AI provider
interfaces (including `anthropic`, `deepseek`, `local-cluster`, `local-lmstudio`,
`local-ollama`, `openai`, `mistral`, `voyage`, and `custom`), each with unique IDs,
non-empty `kinds`, and no brand-domain literals embedded in the catalog data.

#### Scenario: Katalog enthält alle Pflicht-Provider mit eindeutigen IDs

- **GIVEN** `KI_CATALOG` ist die zentrale Provider-Registry
- **WHEN** die IDs aller Einträge ausgelesen werden
- **THEN** enthält der Katalog mindestens `anthropic`, `deepseek`, `local-cluster`, `openai`, `voyage` und `custom`; alle IDs sind eindeutig und jeder Eintrag hat mindestens eine `kind`

#### Scenario: Lokale GPU-Provider brauchen keinen API-Key

- **GIVEN** `local-lmstudio` und `local-ollama` sind im Katalog eingetragen
- **WHEN** ihre Eigenschaften geprüft werden
- **THEN** haben beide `apiKeyEnv: undefined`, `perRowApiKey: false` und `defaultBaseUrl` zeigt auf `localhost` (Port 1234 für LM Studio)

---

### Requirement: KI-Services-Registry und Anti-Drift-SOURCE-Konstanten

The system SHALL define a `KI_SERVICES` registry of service definitions (each with a
unique `key`, `source`, valid `tier`, and `paramSet`) and SHALL export typed `SOURCE`
constants so that runtime call-sites never use string literals for source identifiers.

#### Scenario: Kern-Dienste sind in der Registry eingetragen

- **GIVEN** `KI_SERVICES` ist die zentrale Service-Registry
- **WHEN** die Schlüssel aller Einträge ausgelesen werden
- **THEN** enthält die Registry mindestens `website-llm`, `assistant-chat`, `ticket-triage` und `coaching`; alle keys und sources sind eindeutig

#### Scenario: Runtime-Call-Sites nutzen SOURCE statt String-Literale

- **GIVEN** die Quelldateien `claude.ts`, `ticket-triage.ts` und `assistant/llm.ts`
- **WHEN** der Quelltext auf hardkodierte Source-Strings geprüft wird
- **THEN** enthält jede Datei einen Aufruf wie `SOURCE.websiteLlm` bzw. `SOURCE.ticketTriage` und keinen direkten String wie `getProviderConfig('website-llm'`

---

### Requirement: Provider-Config-Routing DB-backed mit Anthropic-Fallback

The system SHALL select the highest-priority healthy provider row for a given
`(source, tier)` pair from the database, SHALL fall back to `anthropic / claude-sonnet-4-6`
when the DB is unavailable, and SHALL bypass the DB entirely for the `opus` tier.

#### Scenario: Datenbank liefert einen Provider

- **GIVEN** die DB enthält einen aktiven Provider-Eintrag für `(website-llm, sonnet)`
- **WHEN** `getProviderConfig('website-llm', 'sonnet')` aufgerufen wird
- **THEN** gibt die Funktion `modelId` und `baseUrl` aus dem DB-Eintrag zurück

#### Scenario: Opus-Tier umgeht die Datenbank

- **GIVEN** keine Datenbank-Verbindung ist nötig
- **WHEN** `getProviderConfig('website-llm', 'opus')` aufgerufen wird
- **THEN** gibt die Funktion sofort den Anthropic-Fallback zurück, ohne eine Datenbankabfrage auszuführen

---

### Requirement: Knowledge-Collection-Merge mit Modell-Konsistenzprüfung

The system SHALL merge two or more `custom` knowledge collections into a new collection
by moving all documents and chunks, deleting the source collections and any associated
`coaching.books` entries, and SHALL reject merges between collections with different
`embedding_model` values.

#### Scenario: Erfolgreicher Merge zweier Custom-Collections

- **GIVEN** zwei Custom-Collections `alpha` (3 Chunks) und `beta` (2 Chunks) existieren
- **WHEN** `mergeCollections({ sourceIds: [alpha, beta], name: 'merged-ab' })` aufgerufen wird
- **THEN** wird eine neue Collection `merged-ab` mit `chunk_count: 5` erzeugt, die Quell-Collections werden gelöscht und `coaching.books`-Einträge für die Quellen werden entfernt

#### Scenario: Merge mit gemischten Embedding-Modellen schlägt fehl

- **GIVEN** Collection A hat `embedding_model = 'bge-m3'` und Collection B hat `embedding_model = 'voyage-multilingual-2'`
- **WHEN** `mergeCollections({ sourceIds: [A, B], name: 'fail' })` aufgerufen wird
- **THEN** wirft das System `MixedEmbeddingModelError` und führt keinen Merge durch

---

### Requirement: Prompt-Library-Schema mit Self-Healing und Idempotenz

The system SHALL create the `prompt_library` table on first use via
`ensurePromptLibrarySchema` (idempotent — safe to call multiple times), SHALL scope all
prompts by `brand`, and SHALL support upsert-by-title (insert or update on
`(brand, title)` conflict) as well as rename-by-id.

#### Scenario: Schema-Erstellung auf einer leeren Datenbank

- **GIVEN** eine frische Datenbank ohne `prompt_library`-Tabelle
- **WHEN** `ensurePromptLibrarySchema` aufgerufen wird
- **THEN** wird die Tabelle angelegt und `listPrompts` gibt ein leeres Array zurück; ein zweiter Aufruf von `ensurePromptLibrarySchema` verursacht keinen Fehler

#### Scenario: Upsert-by-Title aktualisiert vorhandene Prompts ohne Duplikat

- **GIVEN** ein Prompt `(brand: 'mentolder', title: 'FAQ')` existiert bereits
- **WHEN** `upsertPrompt` mit denselben `brand` und `title`, aber geändertem `body` aufgerufen wird
- **THEN** enthält die Tabelle genau einen Eintrag für `(mentolder, FAQ)` mit dem aktualisierten `body`

---

### Requirement: Prompt-Insert-Client mit Fehlertoleranz

The system SHALL insert prompt bodies into a chat draft at the correct position
(appending with a single newline separator, trimming whitespace-only drafts) and SHALL
load active prompts from the API with a fail-safe empty-array fallback, and SHALL record
prompt usage as a best-effort fire-and-forget POST without propagating network errors.

#### Scenario: Einfügen in einen bestehenden Draft

- **GIVEN** ein Draft-Text `"Guten Tag."` und ein Prompt-Body `"Hallo"`
- **WHEN** `insertPromptBody` aufgerufen wird
- **THEN** gibt die Funktion `"Guten Tag.\nHallo"` zurück; bei einem Draft, der nur Whitespace enthält, gibt sie den Prompt-Body ohne führende Leerzeichen zurück

#### Scenario: Netzwerkfehler beim Laden oder Protokollieren sind toleriert

- **GIVEN** `fetch` wirft einen Netzwerkfehler beim Aufruf von `loadActivePrompts` oder `recordPromptUse`
- **WHEN** beide Funktionen aufgerufen werden
- **THEN** gibt `loadActivePrompts` ein leeres Array zurück und `recordPromptUse` löst keine Exception aus

---

### Requirement: LLM_HOST_IP Required When LLM_ENABLED

The system SHALL abort the `llm:deploy` task and refuse to start embedding or chat
services when `LLM_ENABLED=true` but `LLM_HOST_IP` is not set in
`environments/<env>.yaml`, because all three GPU gateway Services
(`llm-gateway-lmstudio:1234`, `llm-gateway-tei-embed:8081`, `llm-gateway-tei-rerank:8083`)
point at `${LLM_HOST_IP}` and an unset value silently routes all LLM traffic to an
unreachable endpoint.

#### Scenario: LLM_HOST_IP fehlt bei aktiviertem LLM

- **GIVEN** `LLM_ENABLED=true` ist in der Laufzeitumgebung gesetzt
- **WHEN** der Task `llm:deploy` ausgeführt wird und `LLM_HOST_IP` ist nicht in `environments/<env>.yaml` definiert
- **THEN** bricht der Task mit einer Fehlermeldung ab, bevor irgendwelche Manifeste angewendet werden

#### Scenario: LLM_HOST_IP korrekt gesetzt

- **GIVEN** `LLM_ENABLED=true` und `LLM_HOST_IP` ist auf die wg-mesh-IP des GPU-Hosts gesetzt (z. B. `10.10.0.3`)
- **WHEN** der Task `llm:deploy` ausgeführt wird
- **THEN** werden die Services `llm-gateway-lmstudio`, `llm-gateway-tei-embed` und `llm-gateway-tei-rerank` mit der korrekten IP deployt

---

### Requirement: Embedding Collection Fail-Closed Across Vector Spaces

The system SHALL never silently route an embedding request from one vector space to
another, regardless of the reason for unavailability. A `bge-m3` collection SHALL
always use bge-m3 and fail closed (throwing `EmbeddingQueryError`) if TEI is down;
a `voyage-multilingual-2` collection SHALL always use Voyage. Silent cross-space
fallback is permanently forbidden because vectors from different spaces in the same
cosine-distance query produce garbage retrieval results.

#### Scenario: bge-m3-Collection — TEI nicht erreichbar, kein Voyage-Fallback

- **GIVEN** eine Collection hat `embedding_model = 'bge-m3'` und der TEI-Service ist nicht erreichbar
- **WHEN** eine Embedding-Anfrage für diese Collection gestellt wird
- **THEN** wirft das System einen `EmbeddingQueryError` und führt keinen stillen Fallback auf `voyage-multilingual-2` durch

#### Scenario: voyage-Collection — kein Fallback auf bge-m3

- **GIVEN** eine Collection hat `embedding_model = 'voyage-multilingual-2'` und der Voyage-API-Aufruf schlägt fehl
- **WHEN** eine Embedding-Anfrage für diese Collection gestellt wird
- **THEN** wirft das System einen Fehler und führt keinen Fallback auf `bge-m3` oder den lokalen GPU-Gateway durch

---

### Requirement: Ollama Model Swap Latency and Chat-Class Timeout

The system SHALL configure the chat-class request timeout at no less than 10 seconds
(default: 30 seconds) to accommodate Ollama's model-swap cost of approximately 3–6
seconds on the first call after idle eviction (`OLLAMA_KEEP_ALIVE=5m`). When a
chat-class request exceeds the 30-second timeout, the router SHALL fall back to
Anthropic. The timeout SHALL NOT be set below ~10 seconds without explicit testing
of all four models cold-starting.

#### Scenario: Anfrage nach idle-Eviction — Model Swap

- **GIVEN** Ollama hat das angeforderte Modell nach 5 Minuten Inaktivität evictiert (`OLLAMA_KEEP_ALIVE=5m`)
- **WHEN** die erste Chat-Anfrage nach der Eviction eintrifft
- **THEN** wartet der Router mindestens 10 Sekunden auf die Antwort, um den Model-Swap (~3–6 s) zu tolerieren, bevor er auf Anthropic umschaltet

#### Scenario: Chat-Klasse überschreitet 30-Sekunden-Timeout

- **GIVEN** der lokale Ollama-Dienst antwortet nicht innerhalb von 30 Sekunden
- **WHEN** der llm-router die Chat-Anfrage verarbeitet
- **THEN** fällt der Router auf Anthropic um und gibt eine gültige Antwort zurück, ohne einen Fehler an den Client zu propagieren

---

### Requirement: GPU Host Single Point of Failure for bge-m3 Collections

The system SHALL document and enforce that both production brands share a single GPU
host (`LLM_HOST_IP`) via the three gateway Services. When the GPU host is lost,
embedding indexing on `bge-m3` collections SHALL stall and chat-class requests SHALL
return HTTP 503 with no cloud fallback. Voyage-tagged collections SHALL remain
unaffected because they route directly to the Voyage API.

#### Scenario: GPU-Host nicht erreichbar — bge-m3-Indexierung blockiert

- **GIVEN** der GPU-Host (`LLM_HOST_IP`) ist nicht erreichbar
- **WHEN** ein neues Dokument in eine `bge-m3`-Collection indexiert werden soll
- **THEN** schlägt die Indexierung mit einem Fehler fehl (fail-closed); es gibt keinen Cloud-Fallback und `voyage-multilingual-2`-Collections sind nicht betroffen

#### Scenario: GPU-Host nicht erreichbar — Voyage-Collections funktionieren weiter

- **GIVEN** der GPU-Host ist nicht erreichbar
- **WHEN** eine Embedding-Anfrage für eine `voyage-multilingual-2`-Collection gestellt wird
- **THEN** routet das System die Anfrage direkt an `https://api.voyageai.com` und gibt ein gültiges Embedding zurück

---

### Requirement: Dual bge Pair Roles and VRAM Allocation

The system SHALL operate two bge pairs with fixed, non-overlapping roles. The batch pair
(pair A) SHALL run both `bge-m3` and `bge-reranker-v2-m3` with GPU offload disabled
(`-ngl 0`), residing exclusively in CPU RAM and claiming no VRAM. The interactive pair
(pair B) SHALL run both models with `--fit`, so its VRAM footprint is sized against the
VRAM that is actually free at process start. Chat-class models SHALL therefore take
precedence over pair B by virtue of start order, and neither pair SHALL alter its
offload configuration at runtime.

#### Scenario: Batch-Paar belegt kein VRAM

- **GIVEN** Paar A ist gestartet und beantwortet Embedding-Anfragen
- **WHEN** der VRAM-Verbrauch der bge-Prozesse von Paar A ermittelt wird
- **THEN** ist er null, und die Prozesse laufen mit `-ngl 0` im CPU-RAM

#### Scenario: Chat-Modell hat Vorrang durch Startreihenfolge

- **GIVEN** ein Chat-Modell (z. B. Gemma) ist bereits gestartet und belegt VRAM
- **WHEN** Paar B danach mit `--fit` startet
- **THEN** bemisst sich Paar B am verbleibenden freien VRAM und verdrängt das Chat-Modell nicht

#### Scenario: Kein Laufzeit-Wechsel der Offload-Konfiguration

- **GIVEN** beide Paare laufen
- **WHEN** sich der freie VRAM während des Betriebs ändert
- **THEN** startet kein Paar neu und ändert kein Paar seinen `-ngl`-Wert; die Zuordnung bleibt statisch

---

### Requirement: bge MCP Resource Server

The system SHALL expose embedding and reranking to agents through a dedicated MCP server,
because `llama-server` cannot expose itself as an MCP server — its `--mcp-servers-config`
flag is the MCP *client* path. The MCP server SHALL offer embedding and reranking as MCP
tools that accept text and return vectors respectively ranked results, and SHALL resolve
the backing pair internally so that callers never address a pair, port, model name or
vector dimension directly.

#### Scenario: Agent embedded über MCP ohne Modellkenntnis

- **GIVEN** ein Agent ist mit dem bge-MCP-Server verbunden
- **WHEN** er das Embedding-Tool mit reinem Text aufruft, ohne Modellnamen oder Dimension anzugeben
- **THEN** erhält er ein gültiges Embedding zurück, und die Wahl des Paars bleibt ihm verborgen

#### Scenario: Rerank über MCP liefert sortierte Ergebnisse

- **GIVEN** ein Agent ruft das Rerank-Tool mit einer Query und mehreren Kandidaten auf
- **THEN** erhält er die Kandidaten absteigend nach Relevanz sortiert zurück

---

### Requirement: Bidirectional Failover on Outage and Overload

The system SHALL route each embedding and rerank request to its role-appropriate primary
pair and SHALL fail over to the partner pair when the primary is either unreachable (health
check failing) or overloaded (request queue saturated or latency exceeding the configured
threshold). Failover SHALL work in both directions: agent traffic falls back from pair B to
pair A, and batch traffic falls back from pair A to pair B. Every failover SHALL be logged at
warning level so the degradation is observable rather than silent.

#### Scenario: Interaktiver Pfad weicht bei totem Paar B auf Paar A aus

- **GIVEN** Paar B antwortet nicht mehr auf seinen Health-Check
- **WHEN** ein Agent eine Embedding-Anfrage stellt
- **THEN** wird sie von Paar A beantwortet, und der Wechsel wird als Warnung protokolliert

#### Scenario: Reindex weicht bei totem Paar A auf Paar B aus

- **GIVEN** Paar A antwortet nicht mehr auf seinen Health-Check
- **WHEN** der Reindex-Lauf Embeddings anfordert
- **THEN** werden sie von Paar B beantwortet, und der Wechsel wird als Warnung protokolliert

#### Scenario: Überlast löst Umleitung aus, nicht erst der Ausfall

- **GIVEN** Paar B ist erreichbar, aber seine Queue ist gesättigt bzw. die Latenzschwelle gerissen
- **WHEN** eine weitere Agenten-Anfrage eintrifft
- **THEN** wird sie auf Paar A umgeleitet, obwohl der Health-Check von Paar B grün ist

#### Scenario: Beide Paare aus — fail-closed statt stiller Nullwerte

- **GIVEN** weder Paar A noch Paar B ist erreichbar
- **WHEN** eine Embedding-Anfrage gestellt wird
- **THEN** schlägt sie mit einem Fehler fehl; es werden keine Ersatz- oder Nullvektoren geliefert

---

### Requirement: Reindex Retrieval API and Change Feed

The system SHALL expose the batch pair's work through two endpoints. A retrieval endpoint
SHALL accept a query plus a top-k bound and return the ranked matches from the pgvector
store, performing embedding and reranking server-side so callers need no knowledge of model,
dimension or distance metric. A change feed SHALL report which resources have been
re-embedded since a caller-supplied point in time, so agents can invalidate caches. The
retrieval endpoint SHALL reject queries that would cross vector-space boundaries, consistent
with the existing cross-space query prohibition.

#### Scenario: Retrieval liefert gerankte Treffer ohne Modellparameter

- **GIVEN** der pgvector-Bestand enthält indizierte Ressourcen
- **WHEN** ein Agent den Retrieval-Endpunkt mit einer Query und `top_k` aufruft, ohne Modell oder Distanzmaß anzugeben
- **THEN** erhält er höchstens `top_k` Treffer, absteigend nach Relevanz sortiert

#### Scenario: Änderungs-Feed meldet neu embeddete Ressourcen seit Zeitpunkt

- **GIVEN** seit einem Zeitpunkt `t` wurden Ressourcen neu embedded
- **WHEN** ein Agent den Änderungs-Feed mit `t` abfragt
- **THEN** enthält die Antwort genau die seither neu embeddeten Ressourcen mit ihrem Embedding-Zeitpunkt

#### Scenario: Retrieval verweigert Cross-Space-Query

- **GIVEN** eine Query zielt auf Collections mit unterschiedlichen Vektorräumen
- **WHEN** sie an den Retrieval-Endpunkt gestellt wird
- **THEN** wird sie abgelehnt, statt Treffer aus gemischten Vektorräumen zu mischen

### Requirement: Thinking wird für lokal servierte Modelle abgeschaltet

Konsumenten, die einen Request an einen **lokal servierten** LLM-Endpunkt bauen, MUST set
`chat_template_kwargs.enable_thinking` to `false`. Locally served hybrid reasoning models
write to `reasoning_content` first and leave `choices[0].message.content` empty until
thinking completes; when `max_tokens` is exhausted before that point, the response carries
`finish_reason=length` with empty `content` and no error.

Requests to **remote** providers MUST NOT carry the `chat_template_kwargs` field, because it
is an unknown field there and may be rejected.

The decision MUST be derived from the target URL, not from the model name: a model-name test
misses every locally served model it was not written for.

#### Scenario: Locally served endpoint
- **GIVEN** a request targeting a loopback base URL such as `http://127.0.0.1:18235/v1`
- **WHEN** the request body is built
- **THEN** the body contains `chat_template_kwargs.enable_thinking = false`

#### Scenario: Remote provider endpoint
- **GIVEN** a request targeting a remote base URL such as `https://api.deepseek.com/v1`
- **WHEN** the request body is built
- **THEN** the body contains no `chat_template_kwargs` key

#### Scenario: Token budget suffices once thinking is off
- **GIVEN** a request with a small `max_tokens` budget against a locally served model
- **WHEN** `enable_thinking` is `false`
- **THEN** the response carries `finish_reason=stop` and a non-empty `content`

### Requirement: Request-Bauer sind offline prüfbar

Der Aufbau eines LLM-Request-Bodys MUST live in a unit that can be invoked without a
database, without network access and without a running model server, so that its result can
be asserted in the offline test suite.

Concretely: `scripts/factory/triage-body.sh` is sourceable without side effects and exposes
`_build_triage_body <model> <base_url> <system> <user> <schema_json>`;
`scripts/health-goals-payload.py` is callable as `python3 health-goals-payload.py <model> <gid>`
with the context on stdin.

#### Scenario: Body builder invoked from an offline test
- **GIVEN** no database, no network and no running LLM server
- **WHEN** the test sources `scripts/factory/triage-body.sh` and calls `_build_triage_body`
- **THEN** a complete request body is written to stdout and can be asserted with `jq`

#### Scenario: Payload builder invoked from an offline test
- **GIVEN** no running LLM server
- **WHEN** the test pipes context into `scripts/health-goals-payload.py`
- **THEN** a complete payload is written to stdout and can be asserted with `jq`

### Requirement: Single Provider-Selection Authority

The system SHALL resolve every LLM provider decision (automatic tier-based routing and explicit
user/admin provider choice) exclusively through `getProviderConfig(source, tier)` or
`getProviderByName(providerName, brand?)` in `website/src/lib/provider-config.ts` for Node/TS
callers, and exclusively through `scripts/factory/route-provider.sh` for non-TS callers (bash, Go).
No call site SHALL maintain an independent hardcoded provider→URL or provider→model-default table,
and no call site SHALL read `process.env.ANTHROPIC_API_KEY` (or any other provider API key env var)
directly as a provider-resolution fallback.

#### Scenario: Explicit provider choice resolves via getProviderByName

- **GIVEN** a coaching session configuration with `provider = 'deepseek'`
- **WHEN** `openai-compatible-session-agent.ts` needs the endpoint/API key for that session
- **THEN** it calls `getProviderByName('deepseek', brand)` instead of its own `resolveEndpoint()`
  URL map, and receives `{provider, modelId, baseUrl, apiKey}` from `tickets.provider_config`

#### Scenario: Disabled provider is rejected, not silently substituted

- **GIVEN** `tickets.provider_config` has a row for `provider = 'openai'` with `enabled = false`
- **WHEN** any call site invokes `getProviderByName('openai', brand)`
- **THEN** the system throws a typed error identifying the disabled provider, and does NOT fall
  back to a raw `process.env` API key or a hardcoded default endpoint

#### Scenario: Non-TS caller resolves through route-provider.sh

- **GIVEN** the `factory_ask` MCP tool (`scripts/factory/mcp-go/main.go`) needs a provider for tier `plan`
- **WHEN** the tool handler runs
- **THEN** it invokes `scripts/factory/route-provider.sh factory-mcp plan` and parses its JSON output,
  instead of using its own `FACTORY_LLM_URL`/`FACTORY_LLM_MODEL`/`FACTORY_LLM_API_KEY` env defaults

### Requirement: Bonsai-Only Provider Configuration via Data, Not Code

The system SHALL determine which provider is active purely from `tickets.provider_config.enabled`
rows, so that activating or deactivating a provider requires only a data change, never a code change.

#### Scenario: Only ternary-bonsai-27b is enabled

- **GIVEN** the seed migration `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql` has run
- **WHEN** `getProviderConfig(source, tier)` or `route-provider.sh <source> <tier>` is called for any
  source/tier combination
- **THEN** the resolved provider is `ternary-bonsai-27b` with `baseUrl = http://127.0.0.1:18235`
  (the fixup proxy — never `:8093` directly)

#### Scenario: Re-enabling a provider needs no code change

- **GIVEN** an operator runs `UPDATE tickets.provider_config SET enabled = true WHERE provider = 'deepseek'`
- **WHEN** a call site next resolves a provider for a source/tier that includes a `deepseek` row
- **THEN** `deepseek` becomes selectable again without any deployment or code change

### Requirement: Cooldown and Circuit-Breaker Remain Active in Single-Provider Mode

The system SHALL keep the existing cooldown/circuit-breaker mechanism (`tickets.provider_health`)
active even when only one provider is enabled, so that repeated failures against that provider do
not cause unbounded retries.

#### Scenario: Bonsai server unreachable triggers cooldown, not silent retry storm

- **GIVEN** `ternary-bonsai-27b` is the only enabled provider and its health check fails
  `FAILURE_THRESHOLD` times in a row
- **WHEN** a subsequent call resolves a provider
- **THEN** the system returns the documented emergency-fallback response (marked `emergency: true`)
  instead of repeatedly claiming a slot on a provider in cooldown

### Requirement: Watchdog hält die LLM-Server des GPU-Hosts am Leben

The LLM stack SHALL be supervised by a watchdog process that detects a dead server
and restarts it, rather than relying on the login-time autostart alone. The autostart
shim starts each server exactly once; a server that dies afterwards — VRAM exhaustion,
driver reset, a crash while loading an oversized prompt — stays dead until a human
notices. No Scheduled Task under `\Llama\` exists to observe this: the host is
AzureAD-joined and MDM-managed, and tasks created there are silently removed.

The watchdog SHALL treat a server as dead only when its HTTP health endpoint fails.
A healthy `/health` response without a matching TCP listener SHALL produce a warning
and no restart, because that combination describes a server still in its start-up
window — restarting it would create the very outage the watchdog exists to prevent.

The watchdog SHALL start servers with `Start-Process`, never `Start-Job`. A job is
bound to the PowerShell session that created it and dies with it.

The watchdog SHALL exit non-zero only when every supervised server is dead. A single
failed server is the ordinary case the watchdog has just repaired and MUST NOT be
signalled as a stack-wide failure.

#### Scenario: Ein gestorbener Server wird neu gestartet

- **GIVEN** der Watchdog überwacht bge-m3 (`:8095`), den Reranker (`:8096`) und Gemma (`:8091`)
- **WHEN** einer der Server nicht mehr auf `GET localhost:<port>/health` mit `status == "ok"` antwortet
- **THEN** räumt der Watchdog den Port, ruft das zugehörige Startskript per `Start-Process`
  auf, wartet bis zu 240 Sekunden auf Health und protokolliert alte PID, Grund und neue PID

#### Scenario: Gesunder Server ohne Listener-Eintrag wird nicht angetastet

- **GIVEN** ein Server antwortet auf `/health` mit `status == "ok"`
- **WHEN** `Get-NetTCPConnection` für seinen Port noch keinen lauschenden Prozess führt
- **THEN** schreibt der Watchdog eine WARN-Zeile und startet den Server **nicht** neu

#### Scenario: Log-Ausgabe verlässt den Datenpfad der Funktionen

- **GIVEN** die Log-Funktion des Watchdogs schreibt Zeilen, während sie aus einer
  Funktion aufgerufen wird, die einen Zählwert zurückgibt
- **WHEN** der Aufrufer diesen Rückgabewert mit der Anzahl der Server vergleicht
- **THEN** enthält der Rückgabewert ausschließlich den Zählwert und keine Log-Zeilen —
  `Write-Output` würde sie in den Success-Stream legen und den Vergleich auf ein Array
  ausweiten, das als Filter statt als Gleichheit ausgewertet wird

#### Scenario: Der Autostart-Shim kann den Watchdog mitstarten

- **GIVEN** `install-startup-autostart.ps1` wird mit `-Watchdog` aufgerufen
- **WHEN** der Shim im Startup-Ordner geschrieben wird
- **THEN** enthält er nach den Server-Zeilen eine `start /B`-Zeile für
  `watchdog-llm-servers.ps1`, damit die Endlosschleife den Shim nicht blockiert
- **AND** entfernt `-Uninstall` neben dem Shim auch eine noch laufende Watchdog-Instanz

### Requirement: bge-Embedding-Layer läuft als Kubernetes-Deployment

The system SHALL run the bge-m3 embedding model as a Kubernetes Deployment (`bge-embed`) with
CPU-only inference (`-ngl 0`, `CUDA_VISIBLE_DEVICES=''`), exposed via the `llm-gateway-embed`
ClusterIP Service on port 8081. The embedding endpoint SHALL be reachable at
`http://llm-gateway-embed.workspace.svc.cluster.local:8081`.

#### Scenario: Embedding-Deployment ist healthy

- **GIVEN** das `bge-embed` Deployment ist deployed
- **WHEN** ein HTTP GET auf `/health` des llama.cpp-Servers im Container gesendet wird
- **THEN** antwortet der Server mit 200 OK
- **AND** die K8s-Readiness-Probe zeigt den Pod als ready

#### Scenario: Embedding-Request wird verarbeitet

- **GIVEN** `LLM_ENABLED=true` und `LLM_EMBED_URL` zeigt auf den ClusterIP-Service
- **WHEN** `embedQuery(text)` aufgerufen wird
- **THEN** wird der Request an `llm-gateway-embed:8081` gesendet
- **AND** der bge-m3-Server liefert einen Embedding-Vektor zurück

### Requirement: bge-Reranker-Layer läuft als Kubernetes-Deployment

The system SHALL run the bge-reranker-v2-m3 model as a Kubernetes Deployment (`bge-rerank`)
with CPU-only inference, exposed via the `llm-gateway-rerank` ClusterIP Service on port 8081.

#### Scenario: Reranker-Deployment ist healthy

- **GIVEN** das `bge-rerank` Deployment ist deployed
- **WHEN** ein HTTP GET auf `/health` gesendet wird
- **THEN** antwortet der Server mit 200 OK

#### Scenario: Reranking-Request wird verarbeitet

- **GIVEN** `LLM_RERANK_ENABLED=true` und `LLM_RERANKER_URL` zeigt auf den ClusterIP-Service
- **WHEN** `rerank(query, documents)` aufgerufen wird
- **THEN** wird der Request an `llm-gateway-rerank:8081` gesendet
- **AND** der bge-reranker liefert Relevanz-Scores zurück

### Requirement: Single-Pool-Routing ohne Batch-Paar

The system SHALL use a single embedding/reranking pool. Der `bge-router.ts` SHALL nur noch
eine URL-Auflösung pro Endpoint-Typ (`embed` / `rerank`) über Environment-Variablen anbieten.
Health-Checks und Overload-Detection entfallen — K8s-Readiness übernimmt die Gesundheitsüberwachung.

#### Scenario: Embed-URL wird aufgelöst

- **GIVEN** `LLM_EMBED_URL` ist gesetzt
- **WHEN** `resolveEndpoint('embed')` aufgerufen wird
- **THEN** wird die URL aus der Environment-Variable zurückgegeben

#### Scenario: Fehlende URL wirft Fehler

- **GIVEN** `LLM_EMBED_URL` ist nicht gesetzt
- **WHEN** `resolveEndpoint('embed')` aufgerufen wird
- **THEN** wird ein Error geworfen

### Requirement: Embedding-Server als llama.cpp-Instanz mit CLS-Pooling

The system SHALL serve `bge-m3` embeddings from a dedicated `llama-server` instance running the
Q8_0 GGUF with GPU offload, bound to `0.0.0.0:8095`, started with explicit `--pooling cls` and the
default L2 normalisation (`--embd-normalize 2`), and SHALL NOT depend on a TEI container or any
socat forwarder.

#### Scenario: Embedding-Endpunkt liefert 1024-dimensionale Vektoren

- **GIVEN** der Embedding-Server läuft auf `:8095` mit `--embedding --pooling cls`
- **WHEN** `POST /v1/embeddings` mit `{model, input}` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und `data[0].embedding` hat 1024 Dimensionen

#### Scenario: Startskript setzt Pooling explizit

- **GIVEN** das versionierte Startskript für den Embedding-Server
- **WHEN** sein Inhalt geprüft wird
- **THEN** enthält es `--pooling cls` — der Modell-Default wird nicht implizit übernommen

---

### Requirement: Rerank-Server als eigenständige llama.cpp-Instanz

The system SHALL serve `bge-reranker-v2-m3` from a separate `llama-server` instance started with
`--reranking` on `0.0.0.0:8096`, because llama.cpp cannot serve embedding and reranking pooling
modes from a single process.

#### Scenario: Rerank-Endpunkt sortiert nach Relevanz

- **GIVEN** der Rerank-Server läuft auf `:8096` mit `--reranking`
- **WHEN** `POST /v1/rerank` mit `{model, query, documents}` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und `results[]` enthält genau so viele Einträge wie
  übergebene Dokumente, jeder mit `index` und `relevance_score`

#### Scenario: Embedding- und Rerank-Server sind getrennte Prozesse

- **GIVEN** die versionierten Startskripte
- **WHEN** ihr Inhalt geprüft wird
- **THEN** existieren zwei getrennte Skripte mit unterschiedlichen Ports, und keines setzt
  `--embedding` und `--reranking` gemeinsam

---

### Requirement: Neustartfeste LLM-Server über Windows Scheduled Tasks

The system SHALL start the embedding, reranking and Bonsai `llama-server` instances automatically
after host reboot via Windows Scheduled Tasks (`At system startup`, `RunAs SYSTEM`, restart on
failure), driven by versioned PowerShell start scripts under `scripts/llm/`, and the registration
script SHALL be idempotent.

#### Scenario: Startskripte sind versioniert

- **GIVEN** das Repository
- **WHEN** `scripts/llm/` geprüft wird
- **THEN** existieren Startskripte für Embedding-, Rerank- und Bonsai-Server sowie ein
  Registrierungsskript für die Scheduled Tasks

#### Scenario: Wiederholte Registrierung ist folgenlos

- **GIVEN** die Scheduled Tasks sind bereits registriert
- **WHEN** das Registrierungsskript erneut ausgeführt wird
- **THEN** endet es erfolgreich, ohne doppelte Tasks anzulegen

---

### Requirement: VRAM-Notausstieg per Umgebungsvariable

The system SHALL allow moving the embedding model off the GPU on demand via the `LLM_EMBED_NGL`
environment variable (default `99`, `0` = CPU only), and SHALL NOT offload automatically, because
silent automatic offloading would degrade latency by orders of magnitude without warning.

#### Scenario: Startskript reicht LLM_EMBED_NGL durch

- **GIVEN** das Embedding-Startskript
- **WHEN** sein Inhalt geprüft wird
- **THEN** liest es `LLM_EMBED_NGL` mit Default `99` und übergibt den Wert an `-ngl`

---

### Requirement: Vektor-Äquivalenz-Gate vor dem Cutover

The system SHALL verify embedding equivalence between the previous TEI float32 endpoint and the new
Q8_0 GGUF endpoint before switching any environment variable, using a fixed multilingual text
sample and mean cosine similarity, with a pass threshold of **0.99**. The previous TEI container
SHALL remain running until the measurement passes.

#### Scenario: Gate bestanden

- **GIVEN** die mittlere Kosinus-Ähnlichkeit über das Textsample beträgt mindestens 0.99
- **WHEN** der Cutover durchgeführt wird
- **THEN** werden die Env-Vars umgestellt und der TEI-Container anschließend abgeschaltet

#### Scenario: Gate gerissen

- **GIVEN** die mittlere Kosinus-Ähnlichkeit liegt unter 0.99
- **WHEN** das Messergebnis vorliegt
- **THEN** bleiben die Env-Vars auf TEI, der Cutover unterbleibt, und ein Folgeticket für den
  pgvector-Reindex wird angelegt

---

### Requirement: Vier parallele Slots auf dem lokalen Chat-Server

The system SHALL run the Bonsai `llama-server` with `-np 4` so that four subagents can be served
concurrently, and SHALL size `-c` such that each slot retains at least 32k context, with the
concrete value determined by VRAM measurement rather than estimation.

#### Scenario: Startskript konfiguriert vier Slots

- **GIVEN** das Bonsai-Startskript
- **WHEN** sein Inhalt geprüft wird
- **THEN** enthält es `-np 4` und ein `-c`, das geteilt durch 4 mindestens 32768 ergibt

---

### Requirement: Keine Referenzen auf abgeschaltete LLM-Endpunkte

The system SHALL NOT reference the decommissioned LM Studio endpoint or the TEI gateway services in
environment configuration or Kubernetes manifests.

#### Scenario: Konfiguration ist frei von toten Endpunkten

- **GIVEN** `environments/*.yaml`, `environments/schema.yaml` und `k3d/llm-gpu.yaml`
- **WHEN** ihr Inhalt geprüft wird
- **THEN** kommen weder `llm-gateway-lmstudio`, `llm-gateway-tei-embed`, `llm-gateway-tei-rerank`
  noch `LLM_LMSTUDIO_URL` darin vor

### Requirement: LLM-Router Strict-Fail bei Embedding-Ausfall (E2E)
<!-- e2e: fa-34-llm-strict-fail.spec.ts -->

The system SHALL return HTTP 5xx (not a silent 200 with Voyage fallback) for `bge-m3` embedding
requests when the embedding service is down, enforcing fail-closed behaviour. The service in
question is the llama.cpp embedding server; the previous TEI container is no longer part of the
path.

#### Scenario: bge-m3 Embedding gibt 5xx zurück wenn der Embedding-Server ausgefallen ist *(E2E)*

- **GIVEN** der Embedding-Ausfall ist extern simuliert und `LLM_EMBED_URL` ist konfiguriert
- **WHEN** `POST /v1/embeddings` mit `model: 'bge-m3'` und Header `X-Embedding-Purpose: index`
  gesendet wird
- **THEN** antwortet der Router mit HTTP 5xx — ein HTTP 200 würde einen verbotenen
  Silent-Fallback signalisieren

### Requirement: bge-m3 als primärer Embedding-Provider mit Voyage-Fallback

The system SHALL call the bge-m3 embedding endpoint at `LLM_EMBED_URL` first from `embedAll()` in
`scripts/knowledge/lib-knowledge-pg.mjs`, and SHALL fall back to the Voyage AI API for the rest of
the current process run — with a logged warning — only when the bge call fails or `LLM_EMBED_URL`
is not configured. The system SHALL NOT depend on `LLM_ROUTER_URL` /
`llm-router.workspace.svc.cluster.local:4000`, because that Service does not exist in the cluster
(dead code path).

#### Scenario: bge erreichbar → bge-Vektoren

- **GIVEN** `LLM_EMBED_URL` zeigt auf `http://llm-gateway-embed.workspace.svc.cluster.local:8081` und der Endpoint antwortet
- **WHEN** `embedAll(['text'])` aufgerufen wird
- **THEN** liefert das System die 1024-dimensionalen bge-m3-Embeddings des Endpoints ohne Voyage-Aufruf

#### Scenario: bge unerreichbar → Voyage-Fallback mit Warnung

- **GIVEN** `LLM_EMBED_URL` gesetzt ist, aber der Endpoint nicht erreichbar ist
- **WHEN** `embedAll(['text'])` aufgerufen wird
- **THEN** loggt das System eine Fallback-Warnung und liefert Voyage-Embeddings, und bge wird für den Rest des Prozesslaufs nicht erneut versucht

#### Scenario: LLM_EMBED_URL nicht konfiguriert

- **GIVEN** `LLM_EMBED_URL` ist nicht gesetzt
- **WHEN** `embedAll(['text'])` aufgerufen wird
- **THEN** loggt das System eine Warnung und nutzt direkt die Voyage-API

---

### Requirement: LLM_EMBED_URL in knowledge-ingest CronJobs verdrahtet

The system SHALL provide `LLM_EMBED_URL` (value `http://llm-gateway-embed.workspace.svc.cluster.local:8081`)
in the env block of all three knowledge-ingest CronJob containers (`knowledge-ingest-bugs`,
`knowledge-ingest-prs`, `knowledge-ingest-markdown`) in `k3d/knowledge-ingest-cronjob.yaml`, so the
new bge-primär embedding path can be reached from the cluster.

#### Scenario: CronJob-Container haben die Env-Var

- **GIVEN** `k3d/knowledge-ingest-cronjob.yaml`
- **WHEN** die env-Blöcke der drei CronJob-Container geprüft werden
- **THEN** enthält jeder `LLM_EMBED_URL` mit dem Cluster-DNS-Wert auf Port 8081

---

### Requirement: LLM_RERANKER_URL im website-Deployment verdrahtet

The system SHALL wire `LLM_RERANKER_URL: "${LLM_RERANKER_URL}"` into the website Deployment env
block in `k3d/website.yaml`, directly next to the existing `LLM_EMBED_URL` entry, so reranking is
functional as soon as `LLM_RERANK_ENABLED=true` is set (previously a silent gap).

#### Scenario: website-Deployment hat die Env-Var

- **GIVEN** `k3d/website.yaml`
- **WHEN** der env-Block des website-Deployments geprüft wird
- **THEN** enthält er `LLM_RERANKER_URL` mit dem `${LLM_RERANKER_URL}`-Platzhalter

---

### Requirement: Keine toten :8095-Fallbacks in index-repo

The system SHALL reference port 8081 instead of the decommissioned port 8095 in
`resolveEmbedConfig()` of `scripts/index-repo.ts` — both the host-local fallback URL and the
cluster-DNS fallback — and SHALL keep the explanatory comment in sync with the actual Service
port.

#### Scenario: Fallbacks zeigen auf 8081

- **GIVEN** `scripts/index-repo.ts`
- **WHEN** der Code von `resolveEmbedConfig()` geprüft wird
- **THEN** referenziert weder `localUrl` noch der Cluster-Fallback den Port 8095

### Requirement: Gemma server supports host-RAM KV cache

The Gemma start script SHALL provide an opt-in switch that moves the KV cache from VRAM into
host RAM by passing llama.cpp's `-nkvo` flag, and its VRAM estimate SHALL account for the mode.

#### Scenario: KV offload enabled

- **GIVEN** the Gemma start script is invoked with the KV-offload switch
- **WHEN** it assembles the llama-server argument list
- **THEN** the list contains `-nkvo`
- **AND** the printed VRAM requirement excludes the per-context-token KV term
- **AND** the script reports the corresponding host-RAM requirement instead

#### Scenario: KV offload not requested

- **GIVEN** the Gemma start script is invoked without the KV-offload switch
- **WHEN** it assembles the llama-server argument list
- **THEN** the list contains no `-nkvo` flag
- **AND** the VRAM estimate keeps the per-context-token KV term

### Requirement: Gemma server supports persistent slot caches

The Gemma start script SHALL provide an opt-in path parameter that enables llama.cpp's slot
save/restore endpoints, so a prefilled guardrail prefix survives across factory runs.

#### Scenario: Slot save path configured

- **GIVEN** the Gemma start script is invoked with a slot-save path
- **WHEN** it assembles the llama-server argument list
- **THEN** the directory is created if it does not exist
- **AND** the list contains `--slot-save-path` followed by that directory

#### Scenario: Slot save path omitted

- **GIVEN** the Gemma start script is invoked without a slot-save path
- **WHEN** it assembles the llama-server argument list
- **THEN** the list contains no `--slot-save-path` flag

### Requirement: Gemma start script stays ASCII and CRLF safe

Every PowerShell script under the LLM script directory SHALL remain pure ASCII without a byte
order mark, because Windows PowerShell 5.1 decodes BOM-less UTF-8 as CP1252.

#### Scenario: Script encoding guard

- **GIVEN** the Gemma start script in the repository
- **WHEN** its bytes are inspected
- **THEN** no byte outside the ASCII range is present
- **AND** no UTF-8 byte order mark precedes the first line

### Requirement: bge-embed Memory-Limit ueber gemessenem Peak

The system SHALL run the `bge-embed` Deployment with a `limits.memory` of at least
3Gi, keeping the llama.cpp batch parameters `-np 4 -ub 8192` unchanged, so that the
embedding server survives a 64-embedding batch load without an OOMKilled restart.

#### Scenario: Batch-Last ohne OOMKilled

- **GIVEN** the `bge-embed` Deployment in `k3d/llm-gpu.yaml` has `limits.memory: 3Gi`
- **WHEN** a 64-embedding batch is sent to the embedding gateway
- **THEN** the container stays within the memory limit and does not restart with
  `reason=OOMKilled`

#### Scenario: Batch-Parameter bleiben erhalten

- **GIVEN** the `bge-embed` Deployment in `k3d/llm-gpu.yaml`
- **WHEN** the llama.cpp server starts
- **THEN** it runs with `-np 4 -ub 8192` so the throughput for the T002572 benchmark
  is preserved

### Requirement: bge CPU thread count is declared explicitly

The `bge-embed` and `bge-rerank` Deployments in `k3d/llm-gpu.yaml` SHALL pass an
explicit `-t <threads>` argument to llama.cpp. The declared thread count SHALL NOT
exceed the allocatable CPU core count of the smallest node the pod can be scheduled
onto, because the Deployments carry no `nodeSelector` or `affinity` and may land on
any Ready node of the cluster.

#### Scenario: Manifest declares a thread count

- **GIVEN** the manifest `k3d/llm-gpu.yaml`
- **WHEN** the args of the `llama-cpp` container of `bge-embed` and of `bge-rerank`
  are read
- **THEN** each contains a `-t` flag followed by a positive integer

#### Scenario: Thread count fits the smallest schedulable node

- **GIVEN** a cluster whose smallest Ready node has N allocatable CPU cores
- **WHEN** the declared `-t` value is compared against N
- **THEN** the declared value is less than or equal to N

### Requirement: bge CPU limit permits opportunistic burst

The `bge-embed` and `bge-rerank` containers SHALL declare `limits.cpu` above their
`requests.cpu`, so that batch embedding can burst beyond the guaranteed share while
the scheduling footprint stays unchanged.

#### Scenario: Limit exceeds request

- **GIVEN** the resource block of either bge container
- **WHEN** `requests.cpu` and `limits.cpu` are compared
- **THEN** `requests.cpu` is `1000m` and `limits.cpu` is strictly greater

#### Scenario: Raising the limit does not change scheduling

- **GIVEN** a change that raises only `limits.cpu`
- **WHEN** the rendered manifest is diffed against the previous revision
- **THEN** `requests.cpu` is unchanged, so the scheduler's placement decision is
  unaffected and the change is a burst-headroom decision only

### Requirement: Embedding throughput is measurable and reproducible

The repository SHALL provide a benchmark entry point that measures embedding
throughput against the `llm-gateway-embed` Service with a fixed document count and
a fixed document size, and reports both `chunks/s` and the document size the figure
refers to.

#### Scenario: Benchmark reports throughput with its measurement basis

- **GIVEN** a reachable `llm-gateway-embed` Service
- **WHEN** the benchmark entry point is invoked
- **THEN** it prints the achieved `chunks/s` together with the document count, the
  approximate tokens per document and the batch size used

#### Scenario: Benchmark run invalidated by a container restart

- **GIVEN** a benchmark run against `bge-embed`
- **WHEN** the container restart counter increases during the run
- **THEN** the run is reported as invalid rather than as a throughput figure

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Coaching-JSON-Ingest-Script
<!-- bats: coaching-json-ingest.bats -->

The system SHALL provide a `coaching:ingest-json` Taskfile task and the corresponding
`scripts/coaching/ingest-json.mts` script, and SHALL exit with code 2 (with usage output)
when called without arguments and exit with code 1 when the JSON content field is missing.

#### Scenario: Script und Task existieren *(BATS)*
- **GIVEN** das Projekt-Repository ist ausgecheckt
- **WHEN** `Taskfile.yml` und die Skriptpfade geprüft werden
- **THEN** existiert genau ein `coaching:ingest-json:`-Eintrag in `Taskfile.yml`, `scripts/coaching/ingest-json.mts` ist vorhanden und `website/src/lib/ingest-json-core.ts` existiert

#### Scenario: Kein Argument — Exit 2 mit Usage-Ausgabe *(BATS)*
- **GIVEN** `ingest-json.mts` wird ohne Argumente aufgerufen
- **WHEN** der Prozess startet
- **THEN** beendet sich das Script mit Exit-Code 2 und gibt einen `Usage:`-Hinweis aus

#### Scenario: Fehlendes `content`-Feld — Exit 1 *(BATS)*
- **GIVEN** eine JSON-Datei, die ein Objekt mit `id` aber ohne `content`-Feld enthält
- **WHEN** `ingest-json.mts` mit dieser Datei aufgerufen wird
- **THEN** beendet sich das Script mit einem Fehler und gibt `content fehlt` aus

---

### Requirement: Knowledge-Ingest-Manifest korrekte Init-Container-Konfiguration
<!-- bats: knowledge-ingest-manifest.bats -->

The system SHALL configure knowledge-ingest init containers to install npm dependencies
into `/tmp` (not directly into `/scripts`, which is read-only) and SHALL copy the
installed modules to the target directory.

#### Scenario: Init-Container installiert npm nicht in `/scripts` *(BATS)*
- **GIVEN** das Kustomize-Manifest für den knowledge-ingest ist gerendert
- **WHEN** der Befehl `cd /scripts && npm install pg --no-package-lock --silent` im gerenderten Manifest gesucht wird
- **THEN** findet sich dieser Befehl nicht im Manifest (readonly-Mount-Schutz)

#### Scenario: Init-Container verwendet `/tmp` als npm-Prefix *(BATS)*
- **GIVEN** das Kustomize-Manifest für den knowledge-ingest ist gerendert
- **WHEN** das Manifest auf die npm-Install-Befehle geprüft wird
- **THEN** enthält das Manifest `--prefix /tmp` sowie `cp -r /tmp/node_modules/*` zum Kopieren der Module

---

### Requirement: Knowledge-Ingest-Script-Schemakorrektur (keine nicht-existenten Spalten)
<!-- bats: knowledge-ingest-bugs-schema.bats | knowledge-ingest-schema.bats -->

The system SHALL only query columns that exist in the database schema — `ingest-bug-tickets.mjs`
SHALL use `ticket_id` (not `id` or `title`), and `ingest-prs.mjs` SHALL NOT query `body` or
`labels` columns in its SELECT statements.

#### Scenario: `ingest-bug-tickets.mjs` enthält keine nicht-existenten Spalten *(BATS)*
- **GIVEN** das gerenderte Kustomize-Manifest enthält den Ingest-Script-Inhalt
- **WHEN** das Manifest auf `SELECT id, title` geprüft wird
- **THEN** findet sich `SELECT id, title` nicht im Manifest; stattdessen findet sich `ticket_id,`

#### Scenario: `ingest-prs.mjs` enthält keine nicht-existenten Spalten *(BATS)*
- **GIVEN** das gerenderte Kustomize-Manifest enthält den PR-Ingest-Script-Inhalt
- **WHEN** das Manifest nach dem `SELECT pr_number`-Block durchsucht wird
- **THEN** erscheinen `body,` und `labels` nicht in den Ausgabezeilen des Blocks

---

### Requirement: SCS-Indexer-Implementierung (Struktur und Schema)
<!-- bats: scs-index.bats -->

The system SHALL implement `scripts/index-repo.ts` with a non-empty file, `code_embeddings`
and `file_dependencies` DDL, an `ivfflat` cosine-similarity index, a `UNIQUE(file_path,
chunk_index)` constraint, SHA-256 file hashing, `--file` flag, bge-m3 model references,
`extractImports` for dependency graph, `chunkYaml` for YAML chunking, and exclusion of
`node_modules` and `dist`.

#### Scenario: Indexer-Datei existiert und ist nicht leer *(BATS)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `scripts/index-repo.ts` auf Existenz und Inhalt geprüft wird
- **THEN** existiert die Datei und ist nicht leer

#### Scenario: `code_embeddings`-DDL vorhanden (mind. 3 Referenzen) *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `code_embeddings` gezählt wird
- **THEN** erscheint der Begriff mindestens 3 Mal

#### Scenario: `file_dependencies`-DDL vorhanden (mind. 2 Referenzen) *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `file_dependencies` gezählt wird
- **THEN** erscheint der Begriff mindestens 2 Mal

#### Scenario: Vektordimension über `EMBED_DIM`-Konstante (mind. 2 Referenzen) *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `EMBED_DIM` gezählt wird
- **THEN** erscheint die Konstante mindestens 2 Mal

#### Scenario: `--file`-Flag für inkrementellen Reindex vorhanden *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `--file` geprüft wird
- **THEN** ist das Flag mindestens 1 Mal referenziert

#### Scenario: bge-m3-Modell referenziert *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `bge-m3` geprüft wird
- **THEN** ist das Modell mindestens 1 Mal referenziert

#### Scenario: `extractImports` für Dependency-Graph vorhanden *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `extractImports` geprüft wird
- **THEN** ist die Funktion mindestens 1 Mal referenziert

#### Scenario: `node_modules` und `dist` werden ausgeschlossen *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf Ausschlussfilter geprüft wird
- **THEN** enthält der Quelltext Referenzen auf `node_modules` und `'dist'`

#### Scenario: `chunkYaml` für YAML-Chunking vorhanden *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `chunkYaml` geprüft wird
- **THEN** ist die Funktion mindestens 1 Mal referenziert

#### Scenario: SHA-256 für inkrementelles Hashing *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `sha256` geprüft wird
- **THEN** ist die Funktion mindestens 1 Mal referenziert

#### Scenario: `ivfflat`-Index für Cosine-Similarity *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf `ivfflat` geprüft wird
- **THEN** ist der Index mindestens 1 Mal definiert

#### Scenario: `UNIQUE(file_path, chunk_index)`-Constraint *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** der Quelltext auf den UNIQUE-Constraint geprüft wird
- **THEN** enthält der Quelltext exakt `UNIQUE(file_path, chunk_index)`

---

### Requirement: SCS-Such-API und Augmented-Search (Implementierung)
<!-- bats: scs-search.bats -->

The system SHALL implement `website/src/pages/api/codesearch.ts` with admin auth, query
validation, 503 handling for unavailable embedding service, and augmented query support;
and SHALL implement `website/src/lib/codesearch-db.ts` with `searchCode` (pgvector cosine
distance) and `searchCodeAugmented` (1-hop neighbor expansion with score 0.7); the factory
pipeline SHALL integrate SCS with graceful degradation; `DetailPanel.svelte` SHALL display
`suggested_files` with color-coded scores; and the git post-commit hook and Taskfile tasks
SHALL be present.

#### Scenario: `/api/codesearch.ts` existiert *(BATS)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `website/src/pages/api/codesearch.ts` auf Existenz geprüft wird
- **THEN** existiert die Datei

#### Scenario: API erfordert Admin-Auth (mind. 1 `isAdmin`-Referenz) *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** der Quelltext auf `isAdmin` gezählt wird
- **THEN** ist `isAdmin` mindestens 1 Mal referenziert

#### Scenario: API validiert den Query-Parameter `q` *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** der Quelltext auf `searchParams.get('q')` gezählt wird
- **THEN** ist der Aufruf mindestens 1 Mal vorhanden

#### Scenario: API gibt 503 zurück wenn Embedding-Service nicht erreichbar *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** der Quelltext auf `embedding service unavailable` gezählt wird
- **THEN** ist die Meldung mindestens 1 Mal vorhanden

#### Scenario: API unterstützt `augmented`-Query-Parameter *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** der Quelltext auf `augmented` gezählt wird
- **THEN** ist der Parameter mindestens 2 Mal referenziert

#### Scenario: `codesearch-db.ts` mit `searchCode` und pgvector-Operator *(BATS)*
- **GIVEN** `website/src/lib/codesearch-db.ts` ist vorhanden
- **WHEN** der Quelltext auf `export async function searchCode` und `<=>` geprüft wird
- **THEN** existieren beide jeweils mindestens 1 Mal

#### Scenario: `searchCodeAugmented` mit 1-Hop-Nachbarn (score 0.7) *(BATS)*
- **GIVEN** `website/src/lib/codesearch-db.ts` ist vorhanden
- **WHEN** der Quelltext auf `searchCodeAugmented`, `file_dependencies` und `score: 0.7` geprüft wird
- **THEN** existieren alle drei Begriffe mindestens 1 Mal

#### Scenario: `DetailPanel.svelte` zeigt `suggested_files` mit `scoreColor` *(BATS)*
- **GIVEN** `website/src/components/factory/DetailPanel.svelte` und `website/src/lib/factory-floor.ts` sind vorhanden
- **WHEN** der Quelltext auf `suggested_files` und `scoreColor` gezählt wird
- **THEN** erscheint `suggested_files` in `DetailPanel.svelte` mindestens 2 Mal, in `factory-floor.ts` mindestens 2 Mal, und `scoreColor` in `DetailPanel.svelte` mindestens 1 Mal

#### Scenario: Factory-Pipeline mit SCS und graceful degradation *(BATS)*
- **GIVEN** `scripts/factory/pipeline.js` ist vorhanden
- **WHEN** der Quelltext auf `codesearch` und `graceful degradation` gezählt wird
- **THEN** erscheinen beide jeweils mindestens 1 Mal

#### Scenario: Post-commit-Hook existiert und ist ausführbar *(BATS)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `.githooks/post-commit-index` und `scripts/index-repo-incremental.sh` auf Existenz und Ausführbarkeit geprüft werden
- **THEN** existieren beide Dateien und sind ausführbar

#### Scenario: Post-commit-Hook filtert indexierbare Dateiendungen *(BATS)*
- **GIVEN** `.githooks/post-commit-index` ist vorhanden
- **WHEN** der Quelltext auf Dateiendungen `ts|svelte|astro|yaml` gezählt wird
- **THEN** sind die Endungen mindestens 1 Mal referenziert

#### Scenario: Taskfile enthält `scs:index`, `scs:search` und `post-commit-index` *(BATS)*
- **GIVEN** `Taskfile.yml` ist das zentrale Task-Registry
- **WHEN** die Tasks auf Existenz gezählt werden
- **THEN** erscheinen `scs:index`, `scs:search` und `post-commit-index` jeweils mindestens 1 Mal

---

### Requirement: Test-Daten-Purge-Pipeline ohne Gaps (Meetings, Templates, Auth)
<!-- bats: purge-fn-gaps.bats -->

The system SHALL sweep `[TEST]%` meeting entries before the customer allowlist sweep,
SHALL delete `questionnaire_templates` with `e2e-%` titles before `questionnaire_assignments`,
and SHALL require `X-Cron-Secret` / `CRON_SECRET` authentication in `/api/admin/testdata/purge.ts`.

#### Scenario: Meetings werden vor Customers bereinigt (Gap 1) *(BATS)*
- **GIVEN** das neueste `scripts/one-shot/purge-fn-v*.sql` ist vorhanden
- **WHEN** die Datei auf `meeting_type LIKE '[TEST]%'` und die relative Reihenfolge zum Customer-Sweep geprüft wird
- **THEN** existiert der Meeting-Sweep und erscheint vor der Customer-Allowlist-Bereinigung

#### Scenario: `questionnaire_templates` werden vor `questionnaire_assignments` bereinigt (Gap 2) *(BATS)*
- **GIVEN** das neueste `scripts/one-shot/purge-fn-v*.sql` ist vorhanden
- **WHEN** die Datei auf `questionnaire_templates` mit `title LIKE 'e2e-%'` und die Reihenfolge geprüft wird
- **THEN** erscheint der Templates-Delete vor dem `questionnaire_assignments`-Delete

#### Scenario: `purge.ts` erfordert `X-Cron-Secret`-Auth (Gap 3) *(BATS)*
- **GIVEN** `website/src/pages/api/admin/testdata/purge.ts` ist vorhanden
- **WHEN** der Quelltext auf `X-Cron-Secret` und `CRON_SECRET` geprüft wird
- **THEN** sind beide Referenzen vorhanden (spiegelt das Pattern aus `purge-all-test-data.ts`)

---

### Requirement: LLM-Router bge-m3 Embedding-Endpunkt (E2E)
<!-- e2e: fa-32-llm-bge-m3.spec.ts -->

The system SHALL return a valid 1024-dimensional embedding vector via `POST /v1/embeddings`
with model `bge-m3`, and the LLM router base URL SHALL be reachable without 5xx errors.

#### Scenario: bge-m3 Embedding gibt 1024-dimensionalen Vektor zurück *(E2E)*
- **GIVEN** `LLM_ROUTER_URL` oder `LLM_HOST_IP` ist gesetzt und der LLM-Router ist erreichbar
- **WHEN** `POST /v1/embeddings` mit `model: 'bge-m3'` und einem Testtext gesendet wird
- **THEN** antwortet der Router mit HTTP 200, das Body enthält `data[0].embedding` als Array mit genau 1024 Elementen

#### Scenario: LLM-Router-Basis-URL ist erreichbar *(E2E)*
- **GIVEN** `LLM_ROUTER_URL` ist konfiguriert
- **WHEN** der Browser die Basis-URL des Routers aufruft
- **THEN** ist der Body sichtbar und enthält nicht `502 Bad Gateway`

---

### Requirement: LLM-Router voyage-multilingual-2 Embedding-Endpunkt (E2E)
<!-- e2e: fa-33-llm-voyage.spec.ts -->

The system SHALL return a valid 1024-dimensional embedding vector via `POST /v1/embeddings`
with model `voyage-multilingual-2`, independently of the local TEI service status.

#### Scenario: voyage-multilingual-2 Embedding gibt 1024-dimensionalen Vektor zurück *(E2E)*
- **GIVEN** `LLM_ROUTER_URL` ist konfiguriert
- **WHEN** `POST /v1/embeddings` mit `model: 'voyage-multilingual-2'` und einem englischen Testtext gesendet wird
- **THEN** antwortet der Router mit HTTP 200 und `data[0].embedding` hat genau 1024 Dimensionen

#### Scenario: voyage-multilingual-2 funktioniert unabhängig vom TEI-Status *(E2E)*
- **GIVEN** `LLM_ROUTER_URL` ist konfiguriert
- **WHEN** `POST /v1/embeddings` mit `model: 'voyage-multilingual-2'` ein zweites Mal gesendet wird
- **THEN** antwortet der Router erneut mit HTTP 200 und einem 1024-dimensionalen Embedding — TEI wird nicht benötigt

---

### Requirement: LLM-Router Strict-Fail bei TEI-Ausfall (E2E)
<!-- e2e: fa-34-llm-strict-fail.spec.ts -->

The system SHALL return HTTP 5xx (not a silent 200 with Voyage fallback) for `bge-m3`
embedding requests when the TEI service is down, enforcing fail-closed behavior.

#### Scenario: bge-m3 Embedding gibt 5xx zurück wenn TEI ausgefallen ist *(E2E)*
- **GIVEN** `LLM_TEI_DOWN=true` ist gesetzt (TEI-Ausfall extern simuliert) und `LLM_ROUTER_URL` ist konfiguriert
- **WHEN** `POST /v1/embeddings` mit `model: 'bge-m3'` und Header `X-Embedding-Purpose: index` gesendet wird
- **THEN** antwortet der Router mit HTTP 5xx — ein HTTP 200 würde einen verbotenen Silent-Fallback signalisieren

---

### Requirement: MixedEmbeddingModelError bei gemischten Collections (E2E)
<!-- e2e: fa-35-llm-mixed-error.spec.ts -->

The system SHALL reject knowledge queries that span collections with different embedding
models (bge-m3 + voyage) by returning a structured non-200 error, never silently producing
garbage retrieval results. The website SHALL load without import errors related to
`MixedEmbeddingModelError`.

#### Scenario: `/api/knowledge/query` lehnt gemischte Collection-Abfrage ab *(E2E)*
- **GIVEN** die Website läuft und die Knowledge-API ist vorhanden
- **WHEN** `POST /api/knowledge/query` mit `collections: ['bge-m3-docs', 'voyage-knowledge']` gesendet wird
- **THEN** antwortet die API mit HTTP 400, 401, 403, 404 oder 422 — kein stilles 200 mit Garbage-Ergebnissen; bei HTTP 400 enthält das Body einen Hinweis auf `mixed`/`model`/`embedding`

#### Scenario: `/api/portal/knowledge/search` gibt keinen unbehandelten 500-Fehler zurück *(E2E)*
- **GIVEN** die Website läuft
- **WHEN** `POST /api/portal/knowledge/search` mit `models: ['bge-m3', 'voyage-multilingual-2']` gesendet wird
- **THEN** antwortet die API nicht mit HTTP 500 (kein unbehandelter Crash)

#### Scenario: Website-Homepage lädt ohne `MixedEmbeddingModelError`-Scriptfehler *(E2E)*
- **GIVEN** die Website ist erreichbar
- **WHEN** die Browser-Startseite geladen wird und auf `networkidle` gewartet wird
- **THEN** enthält die Fehlerliste keinen Eintrag mit `MixedEmbeddingModelError` oder `Cannot find module`

---

### Requirement: Rerank-Endpunkt gibt korrekt sortierte Ergebnisse zurück (E2E)
<!-- e2e: fa-36-rerank.spec.ts -->

The system SHALL return all reranked documents with the most relevant document ranked first
via `POST /v1/rerank`, returning the same number of results as input documents.

#### Scenario: Rerank ordnet `berlin` als Top-Ergebnis für "capital of germany" *(E2E)*
- **GIVEN** `LLM_ROUTER_URL` ist konfiguriert
- **WHEN** `POST /v1/rerank` mit `query: 'capital of germany'` und Dokumenten `['paris', 'berlin', 'hamburg', 'munich']` gesendet wird
- **THEN** antwortet der Router mit HTTP 200, `results[0].index === 1` (berlin) steht an erster Stelle

#### Scenario: Rerank gibt alle 4 Dokumente zurück *(E2E)*
- **GIVEN** `LLM_ROUTER_URL` ist konfiguriert und 4 Dokumente werden übergeben
- **WHEN** `POST /v1/rerank` gesendet wird
- **THEN** enthält `body.results` genau 4 Einträge

---

### Requirement: Admin-UI für Wissensquellen-Embedding-Modellauswahl (E2E)
<!-- e2e: fa-admin-knowledge-model-selection.spec.ts -->

The system SHALL display an "Einbettungsmodell" selector in the "Web-Quelle" creation modal
with exactly two options (voyage-multilingual-2 and bge-m3), and SHALL persist the selected
model when a collection is created via the API (returning `embedding_model` in the 201 response).

#### Scenario: Modellauswahl-Dropdown im Web-Quelle-Modal vorhanden *(E2E)*
- **GIVEN** ein Admin-Benutzer ist eingeloggt und öffnet den `+ Web-Quelle`-Dialog unter `/admin/wissensquellen`
- **WHEN** das Modal geöffnet wird
- **THEN** ist das Label `Einbettungsmodell` sichtbar und das Dropdown enthält genau 2 Optionen: `voyage-multilingual-2` (Voyage Cloud) und `bge-m3` (Lokal)

#### Scenario: Auswahl von bge-m3 wird beim Anlegen der Collection gespeichert *(E2E)*
- **GIVEN** ein Admin-Benutzer hat bge-m3 im Dropdown ausgewählt und einen Namen und eine Start-URL eingegeben
- **WHEN** der Benutzer auf `Anlegen` klickt
- **THEN** antwortet `POST /api/admin/knowledge/collections` mit HTTP 201 und `created.embedding_model === 'bge-m3'`

---

### Requirement: Wissensquellen-API Auth-Gating (E2E)
<!-- e2e: wissensquellen.spec.ts -->

The system SHALL require authentication for all Wissensquellen admin API endpoints
(collections CRUD, crawl-config, crawl) and SHALL redirect unauthenticated browser access
to the admin page to the login flow.

#### Scenario: `/admin/wissensquellen` leitet unauthentifizierte Benutzer um *(E2E)*
- **GIVEN** ein nicht eingeloggter Browser
- **WHEN** `/admin/wissensquellen` aufgerufen wird
- **THEN** ist die finale URL nicht `/admin/wissensquellen` (Redirect zu Login)

#### Scenario: `GET /api/admin/knowledge/collections` gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `GET /api/admin/knowledge/collections` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: `POST /api/admin/knowledge/collections` gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `POST /api/admin/knowledge/collections` mit `{name, source}` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Collection-Detail-Endpunkt gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `GET /api/admin/knowledge/collections/<uuid>` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: `DELETE /api/admin/knowledge/collections/[id]` gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `DELETE /api/admin/knowledge/collections/<uuid>` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Crawl-Config-Endpunkt gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `PATCH /api/admin/knowledge/collections/<uuid>/crawl-config` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Crawl-Start-Endpunkt gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `POST /api/admin/knowledge/collections/<uuid>/crawl` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Crawl-Status-Endpunkt gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `GET /api/admin/knowledge/collections/<uuid>/crawl` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

---

### Requirement: Coaching-Knowledge-Admin-API Auth-Gating (E2E)
<!-- e2e: fa-coaching-knowledge.spec.ts -->

The system SHALL require authentication for all coaching knowledge admin endpoints
(books, snippets, clusters) and SHALL handle missing book IDs gracefully (no 500 errors).

#### Scenario: `/admin/knowledge/books` leitet unauthentifizierte Benutzer um *(E2E)*
- **GIVEN** ein nicht eingeloggter Browser
- **WHEN** `/admin/knowledge/books` aufgerufen wird
- **THEN** ist die finale URL nicht `/admin/knowledge/books` (Redirect zu Login)

#### Scenario: `GET /api/admin/coaching/books` gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `GET /api/admin/coaching/books` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: `POST /api/admin/coaching/snippets` gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `POST /api/admin/coaching/snippets` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: `GET /api/admin/coaching/clusters` gibt 401/403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authorization-Header ist gesetzt
- **WHEN** `GET /api/admin/coaching/clusters` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Nicht-existente Buch-ID gibt keinen 500-Fehler zurück *(E2E)*
- **GIVEN** eine zufällige UUID, die keinem Buch entspricht
- **WHEN** `GET /admin/knowledge/books/<uuid>` aufgerufen wird
- **THEN** antwortet die API mit einem Statuscode unter 500 (kein unbehandelter Serverfehler)

<!-- merged from change delta llm-pipeline.md (a0c4a63d3c2c) -->

<!-- merged from change delta llm-pipeline.md (cecce6447f37) -->

<!-- merged from change delta llm-pipeline.md (d87665d604ce) -->

<!-- merged from change delta llm-pipeline.md (2b6645804244) -->

<!-- merged from change delta llm-pipeline.md (1497c417d26b) -->

<!-- merged from change delta llm-pipeline.md (aacce93b907d) -->

<!-- merged from change delta llm-pipeline.md (225d73aa5778) -->

<!-- merged from change delta llm-pipeline.md (7e498e162f6b) -->

<!-- merged from change delta llm-pipeline.md (27d436dcc319) -->

<!-- merged from change delta llm-pipeline.md (8bdd01d72c10) -->