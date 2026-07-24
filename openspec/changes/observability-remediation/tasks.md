---
title: "observability-remediation — Implementation Plan"
ticket_id: T002151
domains: [observability, logging, monitoring, website, agent-tooling, infra, security]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# observability-remediation — Implementation Plan

_Ticket: T002151_

## File Structure

- `k3d/monitoring/promtail-rendered.yaml` (geändert — siehe P1)
- `k3d/monitoring/grafana-dashboards/log-explorer.json` (geändert — siehe P1)
- `k3d/monitoring/grafana-dashboards/api-errors.json` (geändert — siehe P1)
- `scripts/factory/otel-emit.cjs` (geändert — siehe P1)
- `website/src/db/migrations/20260724_create_service_health.sql` (neu — siehe P2)
- `k3d/service-health-check-cronjob.yaml` (neu — siehe P2)
- `k3d/kustomization.yaml` (geändert — siehe P2)
- `website/src/pages/api/admin/ops/health.ts` (geändert — siehe P2)
- `website/src/lib/ops/service-health-store.ts` (neu — siehe P2)
- `website/src/pages/api/cron/service-health-check.ts` (neu — siehe P2)
- `website/src/pages/api/admin/ops/health-goals.ts` (neu — siehe P2)
- `website/src/components/admin/platform/HealthTab.svelte` (geändert — siehe P2)
- `.opencode/plugins/agent-tracer.ts` (neu — siehe P3)
- `.opencode/plugins/tsconfig.json` (neu — siehe P3)
- `.claude/skills/references/agent-config-standard.md` (neu — siehe P3)
- `.opencode/agent-models.jsonc` (geändert — siehe P3)
- `scripts/opencode-sync-agents.sh` (geändert — siehe P3)
- `vitest.config.ts` (geändert — siehe P3)
- `environments/.secrets/mentolder.yaml` (geändert, manuell — siehe P4)
- `environments/sealed-secrets/mentolder.yaml` (regeneriert — siehe P4)
- `tests/spec/centralized-logging.bats` (geändert — P1 fokussiert, P5 umfassend)
- `website/src/lib/ops/__tests__/service-health-store.test.ts` (neu — P2 fokussiert, P5 umfassend)
- `.opencode/plugins/agent-tracer.test.ts` (neu — siehe P3)
- `tests/e2e/specs/fa-44-health-goals.spec.ts` (neu — siehe P5)
- `tests/spec/agent-tracing.bats` (neu — siehe P5)
- Details je Partial in `tasks.d/pX-*.md`

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|---------------|------------|
| p1 | tasks.d/p1-logging-pipeline-fixes.md | impl | k3d/monitoring/promtail-rendered.yaml, k3d/monitoring/grafana-dashboards/log-explorer.json, k3d/monitoring/grafana-dashboards/api-errors.json, scripts/factory/otel-emit.cjs | |
| p2 | tasks.d/p2-service-health-goals.md | impl | website/src/db/migrations/20260724_create_service_health.sql, k3d/service-health-check-cronjob.yaml, k3d/kustomization.yaml, website/src/pages/api/admin/ops/health.ts, website/src/lib/ops/service-health-store.ts, website/src/pages/api/cron/service-health-check.ts, website/src/pages/api/admin/ops/health-goals.ts, website/src/components/admin/platform/HealthTab.svelte | |
| p3 | tasks.d/p3-agent-tracing.md | impl | .opencode/plugins/agent-tracer.ts, .opencode/plugins/agent-tracer.test.ts, .opencode/plugins/tsconfig.json, .claude/skills/references/agent-config-standard.md, .opencode/agent-models.jsonc, scripts/opencode-sync-agents.sh, vitest.config.ts | |
| p4 | tasks.d/p4-alertmanager-secret-fix.md | impl | environments/.secrets/mentolder.yaml, environments/sealed-secrets/mentolder.yaml | |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/centralized-logging.bats, website/src/lib/ops/__tests__/service-health-store.test.ts, tests/e2e/specs/fa-44-health-goals.spec.ts, tests/spec/agent-tracing.bats | p1, p2, p3, p4 |

**Cross-Partial-Reconciliation (nach parallelem Fan-out):** P2/P3/P5 wurden parallel von unabhängigen
Subagenten geschrieben und wichen anfangs in Funktionsnamen (`evaluateGoal` vs. `evaluateGoalStatus`),
Modulpfaden, DOM-Contract (`data-testid`) und der P3-Testabdeckungsstrategie
(`createTracerHooks`-Fantasie-API vs. P3s tatsächlichem `createTraceStore`-Kern) voneinander ab. Dies
wurde vor dem Assemblieren gegen die jeweils tatsächlich implementierten Partials korrigiert — siehe
die "Cross-partial contracts, corrected"-Sektion in `tasks.d/p5-tests.md` für die vollständige Historie
der Korrektur. `tests/spec/centralized-logging.bats` und
`website/src/lib/ops/__tests__/service-health-store.test.ts` werden faktisch bereits in P1 bzw. P2 mit
je einem fokussierten Red→Green-Anker angefasst (siehe deren eigene Tasks), tauchen im Partial-Manifest
oben aber nur bei P5 auf (D1-Konvention, analog `coaching-session-beat-choreography`: die umfassend
besitzende Rolle wird deklariert, die inkrementelle Vorstufe nicht) — sequentielle Ausführung
(P1→P2→P3→P4→P5) macht das unkritisch, kein Parallel-Konflikt.

Kontext für alle Partials: `design.md` (Architektur/Decisions/Diagnose), `proposal.md` (Why/What),
`intel.json` (Symbole, DB-Spalten, S1-Budgets, externe Typen), je ein Requirements-Delta in `specs/`.

## Verify (final, nach allen Partials)

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- [ ] P4's manueller Live-Cluster-Check (`tasks.d/p4-alertmanager-secret-fix.md` Task 3) ist grün — nicht CI-automatisierbar, braucht echte Pushover-Credentials.
