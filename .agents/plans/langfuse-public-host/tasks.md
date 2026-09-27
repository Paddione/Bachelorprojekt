---
title: "langfuse-public-host — Implementation Plan"
ticket_id: T900691
domains: [infra, observability, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# langfuse-public-host — Implementation Plan

Langfuse auf devmesh wird als `langfuse-dev.<PROD_DOMAIN>` öffentlich erreichbar: fleet terminiert
TLS mit dem vorhandenen Wildcard und leitet per Tailscale an devmesh-Traefik weiter. Ursache,
Beleg und Entscheidungen D1–D5: `design.md`.

_Ticket: T900691_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dev-local/components/langfuse/langfuse.yaml` | 175 | n/a (S1-ungated) |
| `dev-local/components/langfuse/kustomization.yaml` | 12 | n/a (S1-ungated) |
| `dev-local/components/langfuse/ingress-public.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/core/ingress.yaml` | 46 | n/a (S1-ungated) |
| `environments/dev.yaml` | 64 | n/a (S1-ungated) |
| `environments/schema.yaml` | 1805 | n/a (S1-ungated) |
| `prod-fleet/mentolder/langfuse-dev-proxy.yaml` | 0 (neu) | n/a (S1-ungated) |
| `prod-fleet/mentolder/kustomization.yaml` | 79 | n/a (S1-ungated) |
| `scripts/langfuse/client-env.sh` | 32 | 768 |
| `tests/spec/langfuse-agent-tracing.bats` | 170 | n/a (S1-ungated) |

Budget geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget scripts/langfuse/client-env.sh`.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-devmesh.md | impl | dev-local/components/langfuse/langfuse.yaml, dev-local/components/langfuse/kustomization.yaml, dev-local/components/langfuse/ingress-public.yaml, dev-local/core/ingress.yaml, environments/dev.yaml, environments/schema.yaml | | 27b-local | 40000 |
| p2 | tasks.d/p2-fleet.md | impl | prod-fleet/mentolder/langfuse-dev-proxy.yaml, prod-fleet/mentolder/kustomization.yaml | | 4b-local | 16000 |
| p3 | tasks.d/p3-client.md | impl | scripts/langfuse/client-env.sh | p1 | 4b-local | 8000 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/langfuse-agent-tracing.bats | p1, p2, p3 | 4b-local | 8000 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/langfuse-agent-tracing.bats
```

expected: FAIL (Test 2 und alle T900691-Tests, vor p1–p3).

## Task: Rollout und End-to-End-Nachweis

Nach Merge: `task devmesh:deploy` (devmesh), fleet zieht per Flux. Dann:

```bash
curl -s https://langfuse-dev.mentolder.de/api/public/health      # {"status":"OK",...}
bash scripts/langfuse/client-env.sh && bash scripts/langfuse/setup-harnesses.sh
```

Eine Session je Harness, danach Observations über die Langfuse-API zählen (> 0).

## Task: Finale Verifikation

```bash
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
