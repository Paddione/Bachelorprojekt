---
title: "bge-embed-oom — OOMKilled-Restart-Schleife von bge-embed beheben"
ticket_id: T002580
domains: [infra, testing]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bge-embed-oom — Implementation Plan

Behebt die OOMKilled-Restart-Schleife des `bge-embed`-Containers: Das Deployment
`k3d/llm-gpu.yaml` limitiert `bge-embed` auf `limits.memory: 2Gi`, während der
llama.cpp-Server mit `-b 8192 -ub 8192 -np 4` unter Batch-Last (64 Embeddings)
über dieses Limit hinausläuft. Der Fix: Peak-RSS messen, das Memory-Limit
begründet anheben (und nur falls nötig `-np`/`-ub` senken), und die gewählte
Kombination per Guard-Test dokumentieren.

Design-Rationale: `openspec/changes/bge-embed-oom/proposal.md`.

_Ticket: T002580_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `k3d/llm-gpu.yaml` | 249 | — |
| `tests/spec/llm-pipeline.bats` | 585 | — |

Beide Dateien sind ungated (`.yaml`/`.bats` ohne S1-Extension-Limit) — Budget
`—`. Es entstehen keine neuen Dateien.

## Partials

| Partial | Rolle | Dateien |
| --- | --- | --- |
| p1 | Implementation (Messung + Manifest) | `k3d/llm-gpu.yaml` |
| p2 | Tests (Guard-Test) | `tests/spec/llm-pipeline.bats` |

Partials sind disjoint: p1 berührt nur das Manifest, p2 nur die BATS-Suite.
p2 ist die Test-Rolle und läuft als letztes Partial.

## Verification

- `task workspace:validate` (Kustomize-Dry-Run) nach der Manifest-Änderung (p1)
- `task test:changed` (p2) — der neue Guard-Test ist vor der Änderung rot,
  nach p1 grün
- `task freshness:regenerate && task freshness:check` (p2, letzte Aufgabe)

## Out of Scope

- `bge-rerank`-Limits (kleineres Q4-Modell, kein OOM-Befund im Ticket) — nur
  Beobachtung, keine Änderung
- `scripts/llm/bench-bge-embed.sh` (gehört zu T002572, ist gehalten)
- Änderungen an `requests.memory`/CPU oder an `-ngl 0`
