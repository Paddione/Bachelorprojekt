# K2: Embedding- und Rerank-Ebene (bge-Paare)

> Komponente des Brain-Architektur-Epics T002430.
> Stand: T002551 (bge-K8s-CPU-Migration, shipped).

## Diagramm

```
┌─────────────────────────────────────────────────────────────────┐
│                        K8S CLUSTER (fleet)                       │
│                                                                   │
│  ┌──────────────────────┐           ┌──────────────────────┐     │
│  │ bge-embed Deployment  │           │ bge-rerank Deployment │     │
│  │ ┌──────────────────┐ │           │ ┌──────────────────┐ │     │
│  │ │ llama.cpp :8080   │ │           │ │ llama.cpp :8080   │ │     │
│  │ │ bge-m3 Q8_0.gguf │ │           │ │ reranker Q8_0    │ │     │
│  │ │ --embeddings      │ │           │ │ --reranking       │ │     │
│  │ │ CUDA_VISIBLE=""   │ │           │ │ CUDA_VISIBLE=""   │ │     │
│  │ └────────┬─────────┘ │           │ └────────┬─────────┘ │     │
│  │  PVC:    │            │           │  PVC:    │            │     │
│  │  bge-embed-models    │           │  bge-rerank-models   │     │
│  │  (2Gi, RWO, 1 Repl.) │           │  (2Gi, RWO, 1 Repl.)│     │
│  └──────────┼───────────┘           └──────────┼───────────┘     │
│             │ :8080                             │ :8080            │
│             ▼                                   ▼                  │
│  ┌──────────────────────┐           ┌──────────────────────┐     │
│  │ Service:              │           │ Service:              │     │
│  │ llm-gateway-embed     │           │ llm-gateway-rerank    │     │
│  │ port 8081→target 8080 │           │ port 8081→target 8080 │     │
│  │ .workspace.svc.cluster│           │ .workspace.svc.cluster│     │
│  │ .local:8081           │           │ .local:8081           │     │
│  └──────────┬───────────┘           └──────────┬───────────┘     │
│             │                                   │                  │
└─────────────┼───────────────────────────────────┼──────────────────┘
              │ HTTP /v1/embeddings               │ HTTP /v1/rerank
              │ (POST, OpenAI-kompatibel)          │ (POST, llama.cpp)
              │                                   │
    ┌─────────┴──────────┐              ┌─────────┴──────────┐
    │                    │              │                    │
    ▼                    ▼              ▼                    ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ embeddings.ts │ │ bge-mcp      │ │  rerank.ts   │ │  bge-mcp     │
│ embedQuery()  │ │ server.mjs   │ │ rerankCand.()│ │  server.mjs  │
│ embedBatch()  │ │ bge_embed    │ │              │ │  bge_rerank  │
│               │ │ tool (MCP)   │ │              │ │  tool (MCP)  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │               │                │
       │ resolveEndpoint('embed')       │ resolveEndpoint('rerank')
       │         ▲                      │         ▲
       │         │ ENV                  │         │ ENV
       │    LLM_EMBED_URL              │    LLM_RERANKER_URL
       │         │                      │         │
       └─────────┴──────────────────────┴─────────┘
                          │
                   bge-router.ts
              (einzige Auflösungsstelle)
```

## Schnittstellen

### Endpunkte

| Rolle | Modell | Vektorraum | Dim | Pooling | Service-URL |
|-------|--------|-----------|-----|---------|-------------|
| Embedding | bge-m3 (Q8_0 GGUF) | BGE-M3 | 1024 | CLS | `LLM_EMBED_URL` → `http://llm-gateway-embed:8081/v1/embeddings` |
| Reranking | bge-reranker-v2-m3 (Q8_0 GGUF) | — (Cross-Encoder) | — | — | `LLM_RERANKER_URL` → `http://llm-gateway-rerank:8081/v1/rerank` |

### Aufrufer

| Datei | Funktion | Rolle | Fehlerverhalten |
|-------|----------|------|-----------------|
| `website/src/lib/embeddings.ts:89` | `callRouter()` | embed | bge-m3: **fail-closed** → `EmbeddingQueryError`/`EmbeddingIndexError`; voyage-multilingual-2: **failover** → Voyage API |
| `website/src/lib/rerank.ts:55` | `rerankCandidates()` | rerank | **degrade** → `score: 0` (warned) |
| `scripts/bge-mcp/server.mjs:95` | `embed()` | embed | **fail-closed** → Fehler an MCP-Caller |
| `scripts/bge-mcp/server.mjs:113` | `rerank()` | rerank | **fail-closed** → Fehler an MCP-Caller |

### Konsumenten (indirekt, über embeddings.ts/rerank.ts)

| Datei | Verwendung |
|-------|-----------|
| `website/src/lib/knowledge-db.ts` | Knowledge-Base-Semantiksuche + Reranking |
| `website/src/lib/codesearch-db.ts` | Code-Suche (Embedding) |
| `website/src/lib/tickets-embed.ts` / `tickets-db.ts` | Ticket-Ähnlichkeitssuche |
| `website/src/lib/ingest-json-core.ts` | Batch-Indexierung von JSON-Dokumenten |
| `scripts/index-repo.ts` | Repository-Indexierung |
| `scripts/knowledge/ingest-web.mjs` | Web-Crawling-Ingestion |
| `scripts/brain-ingest.sh` | Brain-Wiki-Ingestion |
| `website/src/pages/api/bge/retrieve.ts` | Öffentlicher Retrieve-API-Endpunkt |
| `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts` | Admin: Document-Embedding |

### Konfiguration (eine Auflösungsstelle)

| Variable | Zweck | Quelle |
|----------|-------|--------|
| `LLM_EMBED_URL` | Embedding-Endpunkt-URL | `environments/*.yaml` → ConfigMap |
| `LLM_RERANKER_URL` | Reranker-Endpunkt-URL | `environments/*.yaml` → ConfigMap |
| `LLM_ENABLED` | Master-Switch für lokales LLM | `environments/*.yaml` |
| `LLM_RERANK_ENABLED` | Reranking ein/aus | `environments/*.yaml` |
| `LLM_EMBED_MODEL` | Modell-ID (informational für Single-Model-llama.cpp) | `environments/*.yaml`, Default `bge-m3` |
| `LLM_RERANK_MODEL` | Modell-ID | Default `bge-reranker-v2-m3` |

**Routing:** `website/src/lib/bge-router.ts:40` (`resolveEndpoint()`) ist die einzige Stelle, die `LLM_EMBED_URL`/`LLM_RERANKER_URL` liest — verwendet von `embeddings.ts`, `rerank.ts` und `scripts/bge-mcp/server.mjs`.

### Deployment

| Ressource | Datei | Details |
|-----------|-------|---------|
| bge-embed Deployment | `k3d/llm-gpu.yaml:44` | llama.cpp CPU-only, 1 Replika, `--embeddings`, Port 8080 |
| bge-rerank Deployment | `k3d/llm-gpu.yaml:151` | llama.cpp CPU-only, 1 Replika, `--reranking`, Port 8080 |
| llm-gateway-embed Service | `k3d/llm-gpu.yaml:122` | Port 8081 → targetPort 8080 |
| llm-gateway-rerank Service | `k3d/llm-gpu.yaml:228` | Port 8081 → targetPort 8080 |
| bge-embed-models PVC | `k3d/llm-gpu.yaml:32` | 2Gi RWO, Modell-Download via InitContainer |
| bge-rerank-models PVC | `k3d/llm-gpu.yaml:138` | 2Gi RWO, Modell-Download via InitContainer |
| Longhorn-Overlay | `prod-fleet/components/llm-models-longhorn/` | Fleet-Cluster: PVCs auf Longhorn (repliziert, nicht node-lokal) |
| bge-MCP-Shim | `scripts/bge-mcp/server.mjs` | HTTP-MCP-Server (127.0.0.1:13005), Bearer-Token-geschützt, systemd-Unit `bge-mcp.service` |

## Silent-Failure-Pfade

| Pfad | Datei:Zeile | Was passiert | Sichtbarkeit |
|------|------------|-------------|-------------|
| Reranker-Endpunkt nicht erreichbar | `rerank.ts:78` | `score: 0` für alle Kandidaten | `logger.warn` |
| `LLM_RERANK_ENABLED=false` | `rerank.ts:62` | `score: 0` für alle Kandidaten | `logger.warn` |
| Keine `LLM_RERANKER_URL` konfiguriert | `rerank.ts:70` | `score: 0` für alle Kandidaten | `logger.warn` + `BgeRoutingError` |
| bge-m3 Embedding nicht erreichbar | `embeddings.ts:132-140` | **fail-closed**: `EmbeddingQueryError` | Exception (propagiert zum API-Caller → 503) |
| bge-m3 Batch-Embedding nicht erreichbar | `embeddings.ts:162-171` | **fail-closed**: `EmbeddingIndexError` | Exception (propagiert zum API-Caller → 503) |
| bge-MCP: kein Endpunkt | `server.mjs:149-156` | **fail-closed**: Fehler an MCP-Caller | JSON-RPC-Error |

### Historische Lehre (T002426)

Der Reranker war wochenlang tot und `rerank.ts` fiel still auf `score: 0` zurück — von außen nicht vom normalen Betrieb unterscheidbar, weil ein unsortiertes Ergebnis wie ein sortiertes aussieht. Seither:
- Alle Degradationspfade loggen via `logger.warn`
- Der bge-MCP-Shim failt closed (keine stillen Ersatzwerte)
- K8s-Readiness-Probes (`/health` auf Port 8080) machen tote Endpunkte im Cluster sichtbar

### Verbleibende Risiken

1. **Single-Replika pro Deployment:** Beide Deployments laufen mit `replicas: 1`. Ein Pod-Ausfall bedeutet Totalausfall der jeweiligen Funktion bis zum Restart.
2. **Kein Batch/Backup-Paar:** Das in T002426 geplante zweite CPU-Paar (Ports 8085/8086) wurde nie gebaut. Es gibt kein bidirektionales Failover mehr — das wurde mit T002551 bewusst entfernt.
3. **Keine Latency/Error-Metriken:** Es gibt keine Prometheus-Metriken oder Alerts für Embedding/Reranking-Latenz oder Fehlerraten. Ausfälle werden nur über `logger.warn` sichtbar (Logs) oder als 503 im API-Pfad.

## Defekt-Referenz (T002430)

| Defekt | Betrifft K2? | Status |
|--------|-------------|--------|
| D1: Keine beschrifteten Schnittstellen | ✅ | Behohen durch dieses Dokument |
| D2: Informationsfluss undurchsichtig | ✅ | Behohen durch Diagramm |
| D3: Keine Fehlerfortpflanzung dokumentiert | ✅ | Silent-Failure-Tabelle oben |
| D4: Host-SPOF (Windows) | ✅ | Behohen durch T002551 (K8s-Migration) |
| D5: Kein Failover | ⚠️ | Single-Replika, kein Batch-Paar |
| D6: Keine Health-Metriken | ⚠️ | Nur K8s-Readiness, keine Prometheus-Metriken |
| D7: Modell-Download manuell | ✅ | Behohen durch InitContainer (idempotenter Download) |
| D8: Konfiguration verstreut | ✅ | Behohen durch bge-router.ts (eine Auflösungsstelle) |

## Ist/Soll-Abgrenzung

| Aspekt | IST (T002551, shipped) | SOLL (T002426, nicht gebaut) |
|--------|----------------------|---------------------------|
| Deployment | 2 Pods im Cluster (CPU-only) | + 2 Batch-Pods (8085/8086) auf separatem Host |
| Routing | 1 Endpunkt pro Rolle (bge-router.ts) | Bidirektionales Partner-Failover |
| Failover | K8s-Restart (minuten) | Sofortiges Partner-Failover bei Ausfall/Überlast |
| Modell-PVC | RWO, 2 separate PVCs | — (keine Änderung) |
| Health | K8s-Readiness-Probe | + Latenz/Fehler-Metriken |

## Änderungshistorie

| Datum | Ticket | Änderung |
|-------|--------|----------|
| 2026-07 | T002110 | bge-m3 und bge-reranker-v2-m3 als llama.cpp-GPU-Server auf Windows-Host (Ports 8095/8096) |
| 2026-07 | T002426 | bge-MCP-Shim + bidirektionales Failover-Design (Partials 1–3 shipped, Batch-Paar nicht gebaut) |
| 2026-07 | T002551 | Migration von Windows/WSL nach Kubernetes (CPU-only, Port 8081). Batch-Paar-Design aufgegeben, Single-Endpoint pro Rolle. |
| 2026-07 | T002432 | Dieses Dokument: Visualisierung und Schnittstellen-Dokumentation |
