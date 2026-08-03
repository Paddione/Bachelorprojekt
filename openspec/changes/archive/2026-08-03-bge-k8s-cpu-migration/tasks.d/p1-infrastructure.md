# Partial p1 — Infrastructure & Code

## Scope

Alle Infrastruktur- und Code-Änderungen für die bge-K8s-Migration in einem Schritt.

## Task List

### 1. k3d/llm-gpu.yaml — Deployment-Manifeste

- [ ] **1.1** bge-ExternalName-Endpoints entfernen: `llm-gateway-embed`, `llm-gateway-rerank`, `llm-gateway-embed-batch`, `llm-gateway-rerank-batch` (Zeilen 15–121)
- [ ] **1.2** PVC `bge-models` anlegen: 2Gi, ReadOnlyMany
- [ ] **1.3** `bge-embed` Deployment: llama.cpp Container, `-ngl 0`, `--embeddings`, Port 8080, Readiness-Probe `/health`, Ressourcen: 1–2Gi RAM, 1–2 CPU
- [ ] **1.4** `bge-embed` Service: ClusterIP, Port 8081 → targetPort 8080
- [ ] **1.5** `bge-rerank` Deployment: analog zu embed, mit `--reranking`
- [ ] **1.6** `bge-rerank` Service: ClusterIP, Port 8081 → targetPort 8080

### 2. website/src/lib/bge-router.ts — Single-Pool

- [ ] **2.1** `resolvePair()` und zugehörige Typen entfernen
- [ ] **2.2** `resolveEndpoint(kind: 'embed' | 'rerank'): string` implementieren
- [ ] **2.3** Health-Check- und Overload-Logik entfernen

### 3. website/src/lib/embeddings.ts — Aufrufer anpassen

- [ ] **3.1** `callRouter()` → `resolveEndpoint('embed')` umstellen
- [ ] **3.2** Batch-spezifische Pfade entfernen

### 4. website/src/lib/rerank.ts — Aufrufer anpassen

- [ ] **4.1** `resolvePair()` → `resolveEndpoint('rerank')` umstellen
- [ ] **4.2** Batch-spezifische Pfade entfernen

### 5. environments/ — Konfiguration

- [ ] **5.1** `LLM_EMBED_BATCH_URL` aus allen `*.yaml` entfernen
- [ ] **5.2** `LLM_RERANKER_BATCH_URL` aus allen `*.yaml` entfernen
- [ ] **5.3** `LLM_BGE_LATENCY_BUDGET_MS` entfernen
- [ ] **5.4** `LLM_BGE_QUEUE_LIMIT` entfernen
- [ ] **5.5** `environments/schema.yaml` — Batch-URL-Einträge entfernen

### 6. scripts/llm/loadouts.json — Bereinigung

- [ ] **6.1** bge-embed, bge-rerank, bge-embed-batch, bge-rerank-batch Loadouts entfernen

### 7. scripts/bge-mcp/server.mjs — Konfiguration prüfen

- [ ] **7.1** Environment-Referenzen auf Batch-URLs prüfen und ggf. anpassen

## Verification

```bash
task workspace:validate    # k3d/ Manifest-Validierung
task env:validate:all      # Environment-Schema
task freshness:check       # Generierte Artefakte
```
