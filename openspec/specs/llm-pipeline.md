# llm-pipeline

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Die LLM-Pipeline umfasst drei Subsysteme: den Embedding-Layer (bge-m3 via TEI auf dem GPU-Host
sowie voyage-multilingual-2 via Voyage-API), den wissensbasierten RAG-Query-Layer (pgvector,
`MixedEmbeddingModelError`-Schutz), sowie den Chat-Router (provider_config-Tabelle, Cooldown,
Tier-basiertes Routing). Alle drei werden über den `LLM_ENABLED`-Schalter gesteuert.

---

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
