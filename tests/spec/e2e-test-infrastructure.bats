#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure.bats
# SSOT: openspec/specs/e2e-test-infrastructure.md
#
# Covers: e2e-seed.ts helper module — seedAvailable, seedAdminTicket, cleanup.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SEED="$REPO/tests/e2e/lib/e2e-seed.ts"
}

# ── Module existence ──────────────────────────────────────────────────

@test "e2e-seed.ts helper module exists" {
  [ -f "$SEED" ]
}

# ── seedAvailable gate ────────────────────────────────────────────────

@test "e2e-seed.ts exports seedAvailable function" {
  run grep -q 'seedAvailable' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts checks both CRON_SECRET and SESSIONS_DATABASE_URL" {
  run grep -q 'CRON_SECRET' "$SEED"
  [ "$status" -eq 0 ]
  run grep -q 'SESSIONS_DATABASE_URL' "$SEED"
  [ "$status" -eq 0 ]
}

# ── seedAdminTicket ───────────────────────────────────────────────────

@test "e2e-seed.ts exports seedAdminTicket function" {
  run grep -q 'seedAdminTicket' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts inserts with is_test_data=true by default" {
  run grep -q 'is_test_data' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts uses INSERT INTO tickets.tickets" {
  run grep -q 'INSERT INTO tickets.tickets' "$SEED"
  [ "$status" -eq 0 ]
}

# ── cleanupSeedTicket ─────────────────────────────────────────────────

@test "e2e-seed.ts exports cleanupSeedTicket function" {
  run grep -q 'cleanupSeedTicket' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts cleanup uses is_test_data guard" {
  run grep -q 'is_test_data' "$SEED"
  [ "$status" -eq 0 ]
}
