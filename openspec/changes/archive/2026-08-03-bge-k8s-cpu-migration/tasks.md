---
title: "bge-k8s-cpu-migration — bge-Stack von WSL-CPU nach Kubernetes-CPU migrieren"
ticket_id: T002551
domains: [infra, website, llm]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002430
depends_on_plans: []
---

# bge-k8s-cpu-migration — Implementation Plan

Migriert die vier bge-Server (embed :8095, rerank :8096, embed-batch :8085, rerank-batch :8086)
vom WSL-CPU-Betrieb auf dem GPU-Host in Kubernetes-Deployments auf den Hetzner-CPU-Nodes.
Eliminiert den Host-SPOF und vereinfacht den bge-router auf Single-Pool.

Design und verworfene Alternativen: `openspec/changes/bge-k8s-cpu-migration/design.md`.

_Ticket: T002551_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `k3d/llm-gpu.yaml` | 122 | — |
| `website/src/lib/bge-router.ts` | 215 | 685 |
| `website/src/lib/embeddings.ts` | 198 | 702 |
| `website/src/lib/rerank.ts` | 83 | 817 |
| `environments/schema.yaml` | 1464 | — |
| `scripts/llm/loadouts.json` | 183 | — |
| `scripts/bge-mcp/server.mjs` | 262 | 538 |

Neue Dateien mit S1-Gate: keine. Alle Änderungen sind Reduktionen (Entfernen von Batch-Paar-Code,
Vereinfachung des Routers).

Ungegatete Dateien ohne S1-Extension-Grenze: `environments/dev.yaml`,
`environments/mentolder.yaml`, `environments/korczewski.yaml`, `environments/staging.yaml`,
`environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`.

Keine der bestehenden Dateien steht in `docs/code-quality/baseline.json`; die wirksame Schwelle
ist damit überall das statische Extension-Limit. Der Router wird durch die Vereinfachung
deutlich kleiner (215 → ~40 Zeilen), keine Datei kommt ihrer Schwelle nahe.

## Partials

| id | Datei | Rolle | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | `tasks.d/p1-infrastructure.md` | impl | `k3d/llm-gpu.yaml`, `website/src/lib/bge-router.ts`, `website/src/lib/embeddings.ts`, `website/src/lib/rerank.ts`, `environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`, `environments/korczewski.yaml`, `environments/staging.yaml`, `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`, `scripts/llm/loadouts.json`, `scripts/bge-mcp/server.mjs` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/llm-pipeline.bats`, `website/src/lib/__tests__/bge-router.test.ts`, `website/src/lib/__tests__/embeddings.test.ts`, `website/src/lib/__tests__/rerank.test.ts` | p1 |

p2 hängt an p1, weil die Test-Assertions gegen die neuen Deployment-Namen und Service-Typen
laufen. Der rot→grün-Failing-Test-Step liegt in p2.

## Task 6 — Failing Test (red→green, vor p1-Deploy)

- [ ] **FAILING (expected: FAIL)**: BATS-Test schreiben der `kubectl get svc llm-gateway-embed -o jsonpath='{.spec.type}'` auf `ClusterIP` prüft — muss fehlschlagen (Service ist noch ExternalName). Run with `bats tests/spec/llm-pipeline.bats --filter 'bge-k8s'` and verify it fails.
- [ ] **FAILING (expected: FAIL)**: Vitest-Test für `resolveEndpoint('embed')` — muss fehlschlagen (Funktion existiert noch nicht). Run with `npx vitest run bge-router.test.ts` and verify it fails.

## Task 7 — Final verification

Nach Abschluss aller Partials, im Worktree ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
task env:validate:all
bash scripts/plan-lint.sh openspec/changes/bge-k8s-cpu-migration/tasks.md
bash scripts/openspec.sh validate
```
