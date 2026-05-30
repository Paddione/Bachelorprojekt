#!/usr/bin/env bats
# Regression: tickets.fn_assign_external_id must allocate external_id from a
# GLOBAL sequence, not a per-brand counter. external_id is globally unique, so
# per-brand counters (tickets.ticket_counters keyed by brand) collide across
# brands — a fresh korczewski counter regenerated T000001.. and clashed with
# existing mentolder ids. Fixed 2026-05-30 (T000339).

setup() {
  load 'lib/bats-support/load'
  load 'lib/bats-assert/load'
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TDB="$REPO_ROOT/website/src/lib/tickets-db.ts"
}

@test "tickets-db.ts assigns external_id from a global sequence (nextval)" {
  run grep -E "nextval\('tickets\.external_id_seq'\)" "$TDB"
  assert_success
}

@test "fn_assign_external_id does NOT allocate external_id from per-brand ticket_counters" {
  # The function body (CREATE OR REPLACE FUNCTION ... fn_assign_external_id)
  # must not INSERT INTO ticket_counters to derive the id. We assert the broken
  # phrase 'INSERT INTO tickets.ticket_counters (brand, last_value)' is not part
  # of the external_id trigger function. (The table may still exist for backfill
  # history, but the trigger must not depend on it.)
  run grep -n "ON CONFLICT (brand) DO UPDATE SET last_value" "$TDB"
  assert_failure
}

@test "external_id sequence is seeded to the current global max on init" {
  run grep -E "setval\('tickets\.external_id_seq'" "$TDB"
  assert_success
}
