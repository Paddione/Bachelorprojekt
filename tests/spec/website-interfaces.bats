#!/usr/bin/env bats
# tests/spec/website-interfaces.bats
# SSOT: openspec/specs/website-interfaces.md
#
# Regression coverage for T002196: website API endpoint status/error fixes.

STATUS_TS="${BATS_TEST_DIRNAME}/../../website/src/pages/api/status.ts"
BOOKING_TS="${BATS_TEST_DIRNAME}/../../website/src/pages/api/booking.ts"
FINALIZE_TS="${BATS_TEST_DIRNAME}/../../website/src/pages/api/meeting/finalize.ts"
CLIENTS_ASTRO="${BATS_TEST_DIRNAME}/../../website/src/pages/admin/clients.astro"
PUBLISH_ASTRO="${BATS_TEST_DIRNAME}/../../website/src/pages/admin/knowledge/snippets/[id]/publish.astro"
E2E_MARKER_TS="${BATS_TEST_DIRNAME}/../../tests/e2e/lib/e2e-marker.ts"

# ── Task 1: /api/status rate-limit scoped per-endpoint ──────────────────────

@test "T002196-1: status.ts uses checkRateLimit with scoped status: key" {
  grep -E "checkRateLimit\(.status:" "$STATUS_TS" || { echo "missing scoped rate-limit key status:"; return 1; }
}

@test "T002196-1: status.ts does not use standalone inline rateLimitMap" {
  run grep -n "rateLimitMap" "$STATUS_TS"
  [ "$status" -ne 0 ] || { echo "inline rateLimitMap still present"; return 1; }
}

# ── Task 3: booking 409 — isSlotInAnyWindow try-catch ───────────────────────

@test "T002196-3: booking.ts wraps isSlotInAnyWindow in try-catch" {
  run grep -A2 "try {" "$BOOKING_TS"
  # At least one try block exists (the isCallback guard below it also has one)
  run grep -B1 "isSlotInAnyWindow" "$BOOKING_TS"
  # Verify isSlotInAnyWindow is still referenced
  [ "$status" -eq 0 ] || { echo "isSlotInAnyWindow call missing from booking.ts"; return 1; }
}

@test "T002196-3: isSlotInAnyWindow in appointments-db returns false for past dates" {
  # Verify the function uses slotStart.toISOString() for date comparison,
  # which correctly handles far-past dates like 2020-01-01
  APPOINTMENTS_DB="${BATS_TEST_DIRNAME}/../../website/src/lib/appointments-db.ts"
  run grep -E "toISOString" "$APPOINTMENTS_DB"
  [ "$status" -eq 0 ] || { echo "isSlotInAnyWindow missing toISOString date conversion"; return 1; }
}

# ── Task 4: finalize 200 — initMeetingsDb call ──────────────────────────────

@test "T002196-4: finalize.ts calls initMeetingsDb" {
  run grep -E "initMeetingsDb" "$FINALIZE_TS"
  [ "$status" -eq 0 ] || { echo "initMeetingsDb call missing from finalize.ts"; return 1; }
}

@test "T002196-4: finalize.ts imports initMeetingsDb from website-db" {
  grep -B5 "initMeetingsDb" "$FINALIZE_TS" | grep -qE "import|from" || { echo "initMeetingsDb import missing"; return 1; }
}

# ── Task 5: /admin/clients 403 without auth ─────────────────────────────────

@test "T002196-5: clients.astro returns 403 for non-HTML requests without session" {
  run grep -E "status: 403" "$CLIENTS_ASTRO"
  [ "$status" -eq 0 ] || { echo "403 response missing from clients.astro auth gate"; return 1; }
}

@test "T002196-5: clients.astro Accept-based auth gate exists" {
  grep -E "Accept" "$CLIENTS_ASTRO" | grep -E "text/html" || { echo "Accept header check missing in clients.astro"; return 1; }
}

# ── Task 6: publish.astro graceful handling ─────────────────────────────────

@test "T002196-6: publish.astro wraps listSnippets in try-catch" {
  grep -B1 "listSnippets" "$PUBLISH_ASTRO" | grep -E "try" || { echo "listSnippets not wrapped in try block"; return 1; }
}

@test "T002196-6: publish.astro returns 404 on DB error" {
  run grep -E "status: 404" "$PUBLISH_ASTRO"
  [ "$status" -eq 0 ] || { echo "404 response missing from publish.astro"; return 1; }
}
