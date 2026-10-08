#!/usr/bin/env bats
# tests/spec/appointment-requests.bats
#
# Guards for T901024: appointment requests with owner confirmation.
# Style: tests/spec/services-calendar.bats. IDs T901024-1..5 feed
# components/website/src/data/test-inventory.json via scripts/build-test-inventory.sh.

LIB_TS="${BATS_TEST_DIRNAME}/../../components/website/src/lib/appointment-requests.ts"
BOOKING_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/booking.ts"
STATUS_ASTRO="${BATS_TEST_DIRNAME}/../../components/website/src/pages/anfrage/[token].astro"
STORNO_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/anfrage/[token]/storno.ts"
UMBUCHUNG_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/anfrage/[token]/umbuchung.ts"
ANNEHMEN_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts"

# ── Case 1: same-day reschedule targets are rejected (Berlin lead time) ─────

@test "T901024-1: umbuchung.ts rejects same-day targets via Berlin lead check (409)" {
  grep -q "berlinDayKey" "$UMBUCHUNG_TS" || { echo "berlinDayKey lead check missing from umbuchung.ts"; return 1; }
  grep -q "status: 409" "$UMBUCHUNG_TS" || { echo "409 response missing from umbuchung.ts"; return 1; }
}

# ── Case 2: previous-day reschedules stay allowed (negative control) ─────────

@test "T901024-2: umbuchung.ts lead check is strict-after (previous-day stays allowed)" {
  grep -qE "[A-Za-z]*DayKey <= [A-Za-z]*DayKey" "$UMBUCHUNG_TS" || { echo "strict-after day-key comparison missing from umbuchung.ts"; return 1; }
}

# ── Case 3: unknown/expired tokens answer identically generic (no enumeration)

@test "T901024-3: token entries share one lookup and one generic 404" {
  for f in "$STATUS_ASTRO" "$STORNO_TS" "$UMBUCHUNG_TS"; do
    grep -q "appointment-requests" "$f" || { echo "p1 lib import missing in $f"; return 1; }
    grep -q "reference_id" "$f" || { echo "token lookup (reference_id) missing in $f"; return 1; }
    grep -q "status: 404" "$f" || { echo "404 response missing in $f"; return 1; }
    grep -q "Nicht gefunden" "$f" || { echo "generic 404 text missing in $f"; return 1; }
    if grep -q "abgelaufen" "$f"; then echo "distinguishing expiry text in $f"; return 1; fi
  done
}

# ── Case 4: owner acceptance re-checks availability before the status flip ───

@test "T901024-4: annehmen.ts rechecks availability atomically before the status update" {
  grep -qE "claimSlot|isSlotInAnyWindow" "$ANNEHMEN_TS" || { echo "availability recheck missing from annehmen.ts"; return 1; }
  claim_line=$(grep -n "claimSlot(" "$ANNEHMEN_TS" | head -1 | cut -d: -f1)
  update_line=$(grep -n "UPDATE inbox_items" "$ANNEHMEN_TS" | head -1 | cut -d: -f1)
  [ -n "$claim_line" ] || { echo "claimSlot call missing from annehmen.ts"; return 1; }
  [ -n "$update_line" ] || { echo "status UPDATE missing from annehmen.ts"; return 1; }
  [ "$claim_line" -lt "$update_line" ] || { echo "claimSlot must precede the status UPDATE in annehmen.ts"; return 1; }
}

# ── Case 5: double submits create exactly one record (idempotency, no dup) ───
# Adapted from the partial plan: p1 task 0 decided the inbox payload suffices,
# so no 20261008_appointment_requests.sql migration exists. The guard asserts
# the payload-based dedupe in the creation path instead of a UNIQUE constraint.

@test "T901024-5: booking.ts dedupes on the idempotency key (single record)" {
  grep -qi "idempotency-key" "$BOOKING_TS" || { echo "idempotency-key header read missing from booking.ts"; return 1; }
  grep -q "payload->>'idempotencyKey'" "$BOOKING_TS" || { echo "payload dedupe lookup missing from booking.ts"; return 1; }
  grep -q "resolveIdempotencyKey" "$BOOKING_TS" || { echo "resolveIdempotencyKey missing from booking.ts"; return 1; }
  [ ! -e "${BATS_TEST_DIRNAME}/../../components/website/src/db/migrations/20261008_appointment_requests.sql" ] || { echo "migration must not exist (p1: inbox payload suffices)"; return 1; }
}
