# Delta: llm-pipeline — bge-K8s-CPU-Migration

## MODIFIED Requirements

### Requirement: bge-Embedding-Layer läuft als Kubernetes-Deployment

> **Ersetzt:** "The system SHALL route embedding calls through the on-cluster GPU gateway
> (`llm-gateway-embed`) when `LLM_ENABLED=true`"

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

> **Ersetzt:** Dual-Pair-Routing (interactive + batch) aus T002426

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

## REMOVED Requirements

- **Batch-Paar-Routing** (T002426 Dual-Pair-Architektur) — ersetzt durch Single-Pool
- **Bidirektionales Failover** (interactive ↔ batch) — ersetzt durch K8s-Replicas
- **bge-Health-Check-Polling** — ersetzt durch K8s-Readiness-Probes
- **Overload-Detection** (Queue-Limit) — ersetzt durch K8s-HPA (später)

## REMOVED Environment Variables

Keine neuen. Entfernt werden:
- `LLM_EMBED_BATCH_URL`
- `LLM_RERANKER_BATCH_URL`
- `LLM_BGE_LATENCY_BUDGET_MS`
- `LLM_BGE_QUEUE_LIMIT`
