---
title: "feature-migrations-runner-auto-T002647 — Implementation Plan"
ticket_id: T002647
domains: [db, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# feature-migrations-runner-auto-T002647 — Implementation Plan

_Ticket: T002647_

## File Structure

- `scripts/migrate-factory.mjs`: Migration runner script for `migrations/*.sql`
- `Taskfile.yml`: Task definitions for `factory:migrate` and integration into `workspace:deploy`
- `tests/spec/database-migrations-runner.bats`: BATS spec tests verifying migration runner execution, tracking, and idempotency
- `openspec/specs/database.md`: Updated database SSOT documentation

## Partials

### P1 — Database Migration Runner Script & Taskfile Entry
- Implement `scripts/migrate-factory.mjs` to sort `.sql` files in `migrations/`, create `public.factory_schema_migrations` tracking table if missing, and execute pending migrations.
- Add `factory:migrate` target in `Taskfile.yml` and hook into `workspace:deploy`.

### P2 — BATS Specification & Integration Tests
- Add `tests/spec/database-migrations-runner.bats` to test migration runner behavior, ledger insertion, and idempotency.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add BATS test `tests/spec/database-migrations-runner.bats` expecting migration runner script to exist and execute properly.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/database-migrations-runner.bats
# expected: FAIL (red — the runner script is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Create `scripts/migrate-factory.mjs` and update `Taskfile.yml`. The BATS test must now pass.

- [ ] **Final Verification.** Run mandatory CI gates:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
