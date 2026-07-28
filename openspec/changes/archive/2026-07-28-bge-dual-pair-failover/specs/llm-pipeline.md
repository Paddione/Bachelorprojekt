## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Rerank-Client mit Graceful Degradation

The system SHALL re-rank candidate documents by relevance score in descending order via
the LLM reranker service. When the primary reranker is unavailable or overloaded, the client
SHALL first attempt the partner pair before degrading. Only when both pairs fail, reranking
is disabled, or the input is empty SHALL it degrade gracefully by returning all documents
with `score: 0`. Every fallback to the partner and every degradation SHALL be logged at
warning level, so a silently unranked result set can no longer go unnoticed.

#### Scenario: Erfolgreiches Reranking

- **GIVEN** `LLM_RERANK_ENABLED=true` und der primäre Reranker antwortet mit Relevanz-Scores
- **WHEN** `rerankCandidates` mit einer Query und drei Kandidaten aufgerufen wird
- **THEN** gibt die Funktion die Dokumente absteigend nach `relevance_score` sortiert zurück

#### Scenario: Primärer Reranker aus — Partner übernimmt statt Degradation

- **GIVEN** der primäre Reranker antwortet mit HTTP 503, der Partner-Reranker ist gesund
- **WHEN** `rerankCandidates` aufgerufen wird
- **THEN** liefert die Funktion korrekt sortierte Ergebnisse vom Partner und protokolliert den Wechsel als Warnung

#### Scenario: Beide Reranker aus oder Reranking deaktiviert

- **GIVEN** entweder `LLM_RERANK_ENABLED=false` oder beide Reranker antworten mit HTTP 503
- **WHEN** `rerankCandidates` aufgerufen wird
- **THEN** gibt die Funktion alle Eingabedokumente in Originalreihenfolge mit `score: 0` zurück, ohne einen Fehler zu werfen, und protokolliert die Degradation als Warnung
