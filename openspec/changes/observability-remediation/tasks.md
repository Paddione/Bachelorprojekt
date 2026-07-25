---
title: "Observability-Remediation: Logging-Pipeline, Service-Health-Goals, Agent-Tracing, Alertmanager-Fix"
ticket_id: T002151
domains: [ops, infra, db, website, test]
status: active
---

# observability-remediation — Implementation Plan

_Ticket: T002151 · Remediation der Observability-Pipeline auf dem fleet-Cluster_

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1-logging | tasks.d/p1-logging.md | impl | `k3d/monitoring/values/promtail-values.yaml`, `scripts/factory/otel-emit.cjs` | |
| p2-health | tasks.d/p2-health.md | impl | `website/src/lib/db/schema-health-goals.sql`, `scripts/health-goals-check.sh`, `k3d/monitoring/health-goals-cronjob.yaml`, `website/src/pages/admin/observability.astro` | |
| p3-tracing | tasks.d/p3-tracing.md | impl | `scripts/agent-tracing.mjs`, `.claude/skills/references/agent-config-standard.md` | |
| p4-alertmanager | tasks.d/p4-alertmanager.md | impl | `k3d/monitoring/alertmanager-secret-template.yaml`, `scripts/reseed-alertmanager-secret.sh` | |
| p5-tests | tasks.d/p5-tests.md | tests | `tests/spec/observability.bats`, `website/src/lib/__tests__/health-goals.test.ts`, `tests/e2e/observability-health.spec.ts` | p1-logging, p2-health, p3-tracing, p4-alertmanager |

## File Structure

```
k3d/monitoring/values/promtail-values.yaml        (mod — numeric level mapping + brand regex fix)
scripts/factory/otel-emit.cjs                      (mod — OTLP endpoint fallback & error hardening)
website/src/lib/db/schema-health-goals.sql        (neu — DB Schema für Health Goals)
scripts/health-goals-check.sh                     (neu — Health check evaluation script)
k3d/monitoring/health-goals-cronjob.yaml           (neu — CronJob Manifest)
website/src/pages/admin/observability.astro        (mod — Admin UI Erweiterung für Health Goals)
scripts/agent-tracing.mjs                          (neu — Agent Tracing via codebase-memory-mcp)
.claude/skills/references/agent-config-standard.md (neu — Doku für Agent Config Standard)
k3d/monitoring/alertmanager-secret-template.yaml   (neu — Secret Template)
scripts/reseed-alertmanager-secret.sh              (neu — Reseed Script)
tests/spec/observability.bats                      (neu — BATS test suite)
website/src/lib/__tests__/health-goals.test.ts    (neu — Vitest unit tests)
tests/e2e/observability-health.spec.ts            (neu — Playwright E2E test)
```

## S1-Budgets

| Datei | Ist | Budget |
|---|---|---|
| `k3d/monitoring/values/promtail-values.yaml` | 38 | 462 |
| `scripts/factory/otel-emit.cjs` | 92 | 109 |

## Task 1: RED — Failing Test Step

Run `bats tests/spec/observability.bats` before implementation.
expected: FAIL

```bash
bats tests/spec/observability.bats
```

## Task 2: Verify All Quality Gates

Finaler Verification Task nach Implementierung aller Partials:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
