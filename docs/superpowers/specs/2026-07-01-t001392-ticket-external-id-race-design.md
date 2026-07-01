---
ticket_id: T001392
plan_ref: openspec/changes/t001392-ticket-external-id-race/tasks.md
---

# T001392 — Ticket external_id race condition — Root-Cause & Fix Design

## Symptom

Two concurrent `scripts/ticket.sh create` invocations both failed with:

```
duplicate key value violates unique constraint "tickets_external_id_key"
```

Both collided IDs (`T001370`, `T001371`) had already been claimed by other parallel
sessions/worktrees before the failing INSERT's trigger-assigned value landed. Only the
third attempt (`T001372`) succeeded.

## Root-Cause Analysis

`scripts/ticket.sh create` never computes `external_id` client-side — it lets a
BEFORE INSERT trigger assign it:

```sql
-- tickets.fn_assign_external_id() (installed by website/src/lib/tickets/migrations.ts)
IF NEW.external_id IS NULL THEN
  next_v := nextval('tickets.external_id_seq');
  NEW.external_id := 'T' || LPAD(next_v::text, 6, '0');
END IF;
```

`nextval()` on a real PostgreSQL sequence is atomic and non-transactional — two concurrent
callers can **never** receive the same value from `nextval()` itself. So the race is not in
the trigger. It is in a second, independent write to the *same* sequence:
`website/src/lib/tickets/migrations.ts` (`applyLegacyMigrations`, called from
`initTicketsSchema()` on every website pod boot / schema-init) ends with:

```sql
SELECT setval('tickets.external_id_seq',
              COALESCE((SELECT MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT))
                          FROM tickets.tickets
                         WHERE external_id ~ '^T[0-9]+$'), 1),
              EXISTS (SELECT 1 FROM tickets.tickets WHERE external_id ~ '^T[0-9]+$'))
```

This unconditionally **overwrites** the sequence's `last_value` with
`MAX(external_id)` read from the table, every time schema-init runs (website pod
(re)start/rollout). Under concurrency this regresses the sequence:

1. Session A (`ticket.sh create`) calls `nextval()` → gets `1371`, builds
   `T001371`, INSERT is in flight but **not yet committed** (open transaction).
2. Concurrently, a website pod restarts and re-runs `applyLegacyMigrations()`. Its
   `SELECT MAX(...)` runs in its own transaction (read-committed) and — because A's row is
   uncommitted — does **not see** `T001371`. It computes `MAX = 1370` and calls
   `setval('tickets.external_id_seq', 1370, true)`, which **walks the sequence backward**;
   the next `nextval()` will now return `1371` again.
3. Session B (another `ticket.sh create`) calls `nextval()` → also gets `1371`.
4. Both A and B eventually commit `external_id = 'T001371'` → the second one hits
   `tickets_external_id_key` unique violation.

The `pg_advisory_lock(hashtext('init:tickets'))` + `ensureSchemaOnce`/`schemaReady` guards in
`tickets-schema.ts` only serialize *schema-init* against *itself* (across processes/repeats
within one process) — they do nothing to prevent this from racing against ordinary
`ticket.sh create` INSERTs, which go through a completely separate `psql` session/connection
and never take that advisory lock.

## Fix

Make the periodic reseed **monotonic-only**: never let `setval` move
`tickets.external_id_seq` backward, only forward. Use `GREATEST` over the observed table max
and the sequence's own current `last_value`:

```sql
SELECT setval('tickets.external_id_seq',
              GREATEST(
                COALESCE((SELECT MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT))
                            FROM tickets.tickets
                           WHERE external_id ~ '^T[0-9]+$'), 1),
                (SELECT last_value FROM tickets.external_id_seq)
              ),
              true)
```

This preserves the existing purpose of the reseed (seed the sequence past any
out-of-band-inserted/backfilled external_id on first boot, and past historical max on a
freshly created sequence) while making it safe against a schema-init pass racing an
in-flight `nextval()`-derived insert: it can only push the sequence *up*, never down, so a
value already handed out by `nextval()` (whether or not the owning transaction has
committed yet) can never be reissued.

This is additive/non-destructive: no table/column/constraint changes, no migration
version bump — only the reseed formula inside the existing idempotent `applyLegacyMigrations()`
statement changes. Fully backward compatible with all existing callers of
`scripts/ticket.sh create`, `ticket-mcp`, and any other INSERT path into `tickets.tickets`
that relies on the trigger.

## Alternative approaches considered

- **INSERT ... ON CONFLICT retry loop in `ticket.sh create`**: would mask the symptom
  (retry until success) without fixing the actual sequence regression, and duplicates retry
  logic across every INSERT call site (`ticket.sh`, `ticket-mcp`, `pipeline.js`, `tickets-db.ts`
  helpers) instead of a single point fix in the sequence maintenance code.
- **Removing the periodic `setval` reseed entirely**: rejected — the reseed is load-bearing
  for the NULL/malformed-external_id backfill immediately above it (T000402) and for
  adopting a vestigial live sequence created out-of-band; removing it would reintroduce the
  original per-brand-counter-era collision class it was written to prevent.

## Regression Test

`tests/spec/ticket-system.bats` (new `@test`, added alongside the existing
`tests/unit/ticket-external-id-sequence.bats` suite which only checks static source
patterns): a live-DB test (guarded by the same `SKIP_LIVE_DB`/OFFLINE convention used
elsewhere in this suite) that:

1. Seeds `tickets.external_id_seq` to a low value.
2. Opens a transaction, calls `nextval('tickets.external_id_seq')`, does **not** commit yet.
3. In a second connection, runs the `GREATEST(...)` reseed statement.
4. Asserts the sequence's `last_value` is **not** less than the value obtained in step 2
   (i.e., the reseed did not regress it) — asserting monotonicity is the property that
   prevents the reported collision.

Since a true multi-session concurrent race is hard to assert deterministically in BATS, the
test targets the specific regression property (monotonic-only reseed) rather than
reproducing the full timing window — this is the standard style already used by
`ticket-external-id-sequence.bats` (structural/property assertions on the SQL, executed
against a real ephemeral Postgres via the existing `SKIP_LIVE_DB` pattern where available,
or a static-source `GREATEST(` assertion otherwise).
