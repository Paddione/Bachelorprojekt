#!/usr/bin/env bats
# Regression: tickets.fn_assign_external_id must allocate external_id from a
# GLOBAL sequence, not a per-brand counter. external_id is globally unique, so
# per-brand counters (tickets.ticket_counters keyed by brand) collide across
# brands — a fresh korczewski counter regenerated T000001.. and clashed with
# existing mentolder ids. Fixed 2026-05-30 (T000339).
# After G-RH01 Batch 2 (T001155) the external_id plumbing lives in
# tickets/migrations.ts; initTicketsSchema() must still call applyLegacyMigrations()
# (which installs the trigger + sequence) so the regression guard continues to
# hold across the split. #2114 (G-CQ07) moved initTicketsSchema() out of
# tickets-db.ts into tickets-schema.ts, so the guard now greps tickets-schema.ts.

setup() {
  load 'lib/bats-support/load'
  load 'lib/bats-assert/load'
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TSCHEMA="$REPO_ROOT/website/src/lib/tickets-schema.ts"
  TMIG="$REPO_ROOT/website/src/lib/tickets/migrations.ts"
}

@test "fn_assign_external_id allocates external_id from a global sequence (nextval)" {
  # The nextval('tickets.external_id_seq') call lives in tickets/migrations.ts
  # (the legacy-migrations module owns the global sequence + trigger function).
  run grep -E "nextval\('tickets\.external_id_seq'\)" "$TMIG"
  assert_success
}

@test "tickets-schema.ts still calls applyLegacyMigrations(pool) (regression guard for the split)" {
  # The split moved external_id plumbing into tickets/migrations.ts; without
  # this call from initTicketsSchema() (now in tickets-schema.ts), the trigger
  # would never install.
  run grep -E "applyLegacyMigrations\([[:space:]]*pool[[:space:]]*\)" "$TSCHEMA"
  assert_success
}

@test "fn_assign_external_id does NOT allocate external_id from per-brand ticket_counters" {
  # The function body (CREATE OR REPLACE FUNCTION ... fn_assign_external_id)
  # must not INSERT INTO ticket_counters to derive the id. We assert the broken
  # phrase 'INSERT INTO tickets.ticket_counters (brand, last_value)' is not part
  # of the external_id trigger function. (The table may still exist for backfill
  # history, but the trigger must not depend on it.)
  run grep -n "ON CONFLICT (brand) DO UPDATE SET last_value" "$TMIG"
  assert_failure
}

@test "external_id sequence is seeded to the current global max on init" {
  run grep -E "setval\('tickets\.external_id_seq'" "$TMIG"
  assert_success
}

# Regression: T001392 — the periodic setval() reseed above ran unconditionally
# on every schema-init (every website pod boot/rollout), overwriting the
# sequence's last_value with MAX(external_id) read from the table. A
# concurrent, not-yet-committed nextval()-derived INSERT (e.g. a running
# `scripts/ticket.sh create`) is invisible to that MAX() read (read-committed
# isolation), so the reseed regressed the sequence backward and a later
# nextval() call re-issued the same external_id, hitting
# tickets_external_id_key. Verified against a real Postgres 16 instance
# (docker) before this fix landed. Fix: make the reseed monotonic-only via
# GREATEST() over the observed table max and the sequence's own current
# last_value, so the reseed can only advance the sequence, never regress it.
@test "external_id sequence reseed is monotonic (never regresses last_value)" {
  run grep -F "GREATEST(" "$TMIG"
  assert_success

  run grep -E "last_value FROM tickets\.external_id_seq" "$TMIG"
  assert_success
}
