---
title: "t001392-ticket-external-id-race — Implementation Plan"
ticket_id: T001392
domains: [database, website]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001392-ticket-external-id-race — Implementation Plan

_Ticket: T001392_

## File Structure

```
docs/superpowers/specs/2026-07-01-t001392-ticket-external-id-race-design.md   (new — root-cause + fix design)
openspec/changes/t001392-ticket-external-id-race/proposal.md                  (new — this proposal)
openspec/changes/t001392-ticket-external-id-race/specs/ticket-system.md       (new — delta spec)
tests/unit/ticket-external-id-sequence.bats                                   (changed — new regression @test)
website/src/lib/tickets/migrations.ts                                         (changed — monotonic setval reseed)
```

## Task 1 — Root-cause reproduction against a real Postgres

Reproduce the exact reported failure (`duplicate key value violates unique constraint
"tickets_external_id_key"`) against a throwaway Postgres 16 container, using the CURRENT
(buggy) reseed SQL from `applyLegacyMigrations()`:

1. `docker run -d --rm -e POSTGRES_PASSWORD=test -p 15499:5432 postgres:16-alpine`
2. Create a minimal `tickets.tickets` + `tickets.external_id_seq` +
   `tickets.fn_assign_external_id()` trigger mirroring the production DDL.
3. Open a transaction, `INSERT` (trigger calls `nextval()`), leave it **uncommitted**.
4. In a second connection, run the CURRENT `setval('tickets.external_id_seq',
   COALESCE(MAX(...), 1), EXISTS(...))` reseed statement — observe it regress
   `last_value` because it cannot see the uncommitted row.
5. Commit the first transaction, then run a fresh `INSERT` — observe the
   `tickets_external_id_key` unique violation.

This confirms the root cause: the periodic reseed in `applyLegacyMigrations()` (run on every
website schema-init / pod boot) is not monotonic and can walk the sequence backward past a
value already dispensed by a concurrent, in-flight `nextval()` call.

<!-- vitest: kein neuer Test nötig, weil die SQL-Race nur gegen eine echte Postgres-Instanz reproduzierbar ist (pg-mem unterstützt weder Concurrency noch `SELECT last_value FROM <sequence>`, siehe website-db-init-hotpath.test.ts für das etablierte Präzedens "strukturelle Invariante statt echter Race"); die BATS-Regression in Task 2 prüft exakt dieselbe strukturelle Invariante wie die bestehende ticket-external-id-sequence.bats-Suite für diese Funktion. -->

## Task 2 — Failing regression test (RED)

Add a new `@test` to `tests/unit/ticket-external-id-sequence.bats` (existing regression
suite for this exact trigger/sequence — do not create a new ticket-numbered file) asserting
the reseed statement in `website/src/lib/tickets/migrations.ts` uses a monotonic `GREATEST(`
pattern over both the table's observed max AND the sequence's own current `last_value`.

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/ticket-external-id-sequence.bats
# expected: FAIL — "external_id sequence reseed is monotonic (never regresses last_value)"
# fails on the current branch because migrations.ts does not yet contain GREATEST(
```

## Task 3 — Fix: monotonic-only sequence reseed (GREEN)

In `website/src/lib/tickets/migrations.ts`, change the final `setval('tickets.external_id_seq',
...)` call inside `applyLegacyMigrations()` to wrap the target value in
`GREATEST(<table MAX(external_id)>, (SELECT last_value FROM tickets.external_id_seq))` instead
of overwriting unconditionally with the table max. This is additive/non-destructive: no
schema/column/constraint change, same idempotent statement, same `is_called` (3rd) argument
semantics — only the reseed *value* computation changes. Re-verify against the same
throwaway Postgres container from Task 1: re-run the exact race scenario with the fixed SQL
and confirm the sequence no longer regresses and the follow-up insert does not collide.

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/ticket-external-id-sequence.bats
# expected: PASS — all 5 tests green, including the new monotonic-reseed assertion
```

## Task 4 — Final Verification

Run the three mandatory CI-equivalent gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
