---
title: "workspace-staging-db-tables — Implementation Plan"
ticket_id: T900819
domains: [infra, database, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# workspace-staging-db-tables — Implementation Plan

Schließt die systemische Lücke hinter T900819: `admin_actions` + `error_log`
leben nur im manuellen migrate-Scope (`pnpm db:migrate`, nie beim Boot) und in
keinem Ensure-Skript — jede frische/restaurierte Staging-DB startet ohne sie,
der `admin-actions-cleanup`-CronJob fällt durch. Zusätzlich bekommen die zwei
Billing-Admin-Routen strukturierte Fehlerpfade (heute unbehandelte 500s ohne
Log-Kontext). Befunde, Gegenproben und Entscheidungen D1–D4: `design.md`,
Symptom/Hypothesen-Trennung: `proposal.md`.

_Ticket: T900819 (verwandt T900801 nur lesend als Kontext, kein Scope)_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `k3d/website-schema.yaml` | 1925 | n/a (S1-ungated, k3d scope-excluded) |
| `components/website/src/pages/api/admin/billing/dunning/run.ts` | 28 | Budget 872 (.ts-Limit 900, nicht-baselined) |
| `components/website/src/pages/api/admin/billing/create-monthly-invoices.ts` | 65 | Budget 835 (.ts-Limit 900, nicht-baselined) |
| `components/website/src/pages/api/admin/billing/dunning/run.test.ts` | neu | neu, klein schneiden (Wachstumsreserve unter .ts-Limit 900) |
| `components/website/src/pages/api/admin/billing/create-monthly-invoices.test.ts` | neu | neu, klein schneiden (Wachstumsreserve unter .ts-Limit 900) |
| `tests/spec/workspace-staging-db-tables.bats` | 70 (RED im Stage-Commit) | n/a (.bats ohne S1-Limit) |
| `components/website/src/data/test-inventory.json` | generiert | n/a (generiert, exakter Guard-Pfad) |

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | tasks.d/p1-schema-ensure.md | impl | `k3d/website-schema.yaml` |  |
| p2 | tasks.d/p2-billing-route-hardening.md | impl | `components/website/src/pages/api/admin/billing/dunning/run.ts`, `components/website/src/pages/api/admin/billing/create-monthly-invoices.ts`, `components/website/src/pages/api/admin/billing/dunning/run.test.ts`, `components/website/src/pages/api/admin/billing/create-monthly-invoices.test.ts` |  |
| p3 | tasks.d/p3-tests-verify.md | tests | `tests/spec/workspace-staging-db-tables.bats`, `components/website/src/data/test-inventory.json` | p1, p2 |

## Task 1 — p1: Ensure-Abdeckung für admin_actions + error_log

Siehe `tasks.d/p1-schema-ensure.md`.

## Task 2 — p2: Billing-Routen härten + Vitest-Coverage

Siehe `tasks.d/p2-billing-route-hardening.md`.

## Task 3 — p3: Failing Test grün + Inventar (Tests-Rolle)

Siehe `tasks.d/p3-tests-verify.md`.

## Task 4 — Finaler Verify-Task (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

<!-- vitest: neue Vitest-Tests sind in p2 enthalten (zwei colocated .test.ts); keine weitere Abdeckung nötig, weil keine weitere Logik geändert wird. -->
