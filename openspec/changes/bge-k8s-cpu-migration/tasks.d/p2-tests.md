# Partial p2 — Tests

## Scope

Tests für die bge-K8s-Migration: BATS (Infrastruktur-Verifikation) + Vitest (Unit-Tests für bge-router, embeddings, rerank).

## Pre-Condition

p1 muss vollständig implementiert und deployed sein.

## Task List

### 1. BATS — Infrastruktur-Tests

- [ ] **1.1** `tests/spec/llm-pipeline.bats` — Test: `bge-embed` Deployment existiert
- [ ] **1.2** Test: `bge-embed` Pod ist ready (Readiness-Probe besteht)
- [ ] **1.3** Test: `bge-rerank` Deployment existiert
- [ ] **1.4** Test: `bge-rerank` Pod ist ready
- [ ] **1.5** Test: `llm-gateway-embed` Service ist ClusterIP (nicht ExternalName)
- [ ] **1.6** Test: `llm-gateway-rerank` Service ist ClusterIP
- [ ] **1.7** Test: Batch-Services (`llm-gateway-embed-batch`, `llm-gateway-rerank-batch`) existieren nicht
- [ ] **1.8** Test: Embedding-Endpoint antwortet auf `/health`
- [ ] **1.9** Test: Reranker-Endpoint antwortet auf `/health`

### 2. Vitest — Unit-Tests

- [ ] **2.1** `website/src/lib/__tests__/bge-router.test.ts` — `resolveEndpoint('embed')` gibt korrekte URL zurück
- [ ] **2.2** Test: `resolveEndpoint('rerank')` gibt korrekte URL zurück
- [ ] **2.3** Test: `resolveEndpoint` wirft Error bei fehlender Environment-Variable
- [ ] **2.4** `website/src/lib/__tests__/embeddings.test.ts` — angepasste Aufrufe testen (Mock-URL)
- [ ] **2.5** `website/src/lib/__tests__/rerank.test.ts` — angepasste Aufrufe testen (Mock-URL)

### 3. Struct2 — Failing Test First (red→green)

- [ ] **3.1** **FAILING (expected: FAIL)**: BATS-Test schreiben, der prüft dass `llm-gateway-embed` ein ClusterIP-Service ist. Run `bats tests/spec/llm-pipeline.bats --filter 'bge-k8s'` and verify it fails — Service ist noch ExternalName vor p1-Deploy.
  ```bash
  # Erwartet: FAIL (Service ist ExternalName, nicht ClusterIP)
  kubectl get svc llm-gateway-embed -n workspace -o jsonpath='{.spec.type}' | grep -q ClusterIP
  ```
- [ ] **3.2** **FAILING (expected: FAIL)**: Vitest-Test für `resolveEndpoint('embed')` schreiben. Run `npx vitest run bge-router.test.ts` and verify it fails — `resolvePair` existiert noch, `resolveEndpoint` noch nicht implementiert.
- [ ] **3.3** Nach p1-Deploy: beide Tests auf GRÜN verifizieren

## Verification

```bash
task test:changed           # Vitest
bash scripts/test-runner.sh # BATS
```
