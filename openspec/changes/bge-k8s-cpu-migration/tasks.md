# Tasks: bge-K8s-CPU-Migration

## Partial Manifest

| # | Rolle | Ziel-Dateien |
|---|-------|-------------|
| p1 | infrastructure | `k3d/llm-gpu.yaml`, `website/src/lib/bge-router.ts`, `environments/*.yaml`, `environments/schema.yaml`, `scripts/llm/loadouts.json`, `scripts/bge-mcp/server.mjs` |
| p2 | tests | `tests/spec/llm-pipeline.bats`, `website/src/lib/__tests__/bge-router.test.ts`, `website/src/lib/__tests__/embeddings.test.ts`, `website/src/lib/__tests__/rerank.test.ts` |

## File Structure

```
openspec/changes/bge-k8s-cpu-migration/
├── proposal.md
├── design.md
├── tasks.md
├── specs/
│   └── llm-pipeline.md          # Delta gegen openspec/specs/llm-pipeline.md
└── tasks.d/
    ├── p1-infrastructure.md
    └── p2-tests.md
```

---

## Partial p1 — Infrastructure & Code

### 1. k3d/llm-gpu.yaml

- [ ] bge-ExternalName-Endpoints entfernen (embed, rerank, embed-batch, rerank-batch)
- [ ] bge-embed Deployment + Service (ClusterIP) anlegen
- [ ] bge-rerank Deployment + Service (ClusterIP) anlegen
- [ ] PVC `bge-models` für Modell-Dateien anlegen
- [ ] `workspace:validate` grün

### 2. website/src/lib/bge-router.ts

- [ ] Dual-Pair-Logik entfernen (`resolvePair`, `PairKind`, `PairEndpoints`)
- [ ] `resolveEndpoint(kind)` — einfache URL-Auflösung aus Env
- [ ] Health-Check-Logik entfernen
- [ ] Aufrufer in `embeddings.ts` und `rerank.ts` anpassen

### 3. environments/

- [ ] `LLM_EMBED_BATCH_URL` aus allen `*.yaml` entfernen
- [ ] `LLM_RERANKER_BATCH_URL` aus allen `*.yaml` entfernen
- [ ] `LLM_BGE_LATENCY_BUDGET_MS` entfernen
- [ ] `LLM_BGE_QUEUE_LIMIT` entfernen
- [ ] `environments/schema.yaml` — Batch-URL-Schema-Einträge entfernen
- [ ] `env:validate:all` grün

### 4. scripts/llm/loadouts.json

- [ ] Alle vier bge-Loadouts entfernen (bge-embed, bge-rerank, bge-embed-batch, bge-rerank-batch)

### 5. scripts/bge-mcp/

- [ ] `server.mjs` — Environment-Referenzen prüfen, ggf. anpassen

---

## Partial p2 — Tests

### 1. BATS

- [ ] `tests/spec/llm-pipeline.bats` — Test: bge-embed Deployment existiert und ist ready
- [ ] Test: bge-rerank Deployment existiert und ist ready
- [ ] Test: llm-gateway-embed Service ist ClusterIP (nicht ExternalName)
- [ ] Test: Batch-Services existieren nicht mehr

### 2. Vitest

- [ ] `bge-router.test.ts` — Single-Pool-API testen
- [ ] `embeddings.test.ts` — Angepasste Aufrufe testen
- [ ] `rerank.test.ts` — Angepasste Aufrufe testen
- [ ] `test:changed` grün

---

## Verification

- [ ] `task workspace:validate`
- [ ] `task test:changed`
- [ ] `task freshness:check`
- [ ] `task env:validate:all`
