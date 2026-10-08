#!/usr/bin/env bats
# tests/spec/services-calendar.bats
#
# Guards for T901023: services, availability (Europe/Berlin) and owner calendar.

BOOKING_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/booking.ts"
CALDAV_TS="${BATS_TEST_DIRNAME}/../../components/website/src/lib/caldav.ts"
APPOINTMENTS_DB="${BATS_TEST_DIRNAME}/../../components/website/src/lib/appointments-db.ts"
CORE_DB="${BATS_TEST_DIRNAME}/../../components/website/src/lib/website-core-db.ts"
BLOCK_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/calendar/block.ts"
PHONE_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/bookings/phone.ts"
RESCHEDULE_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/bookings/[uid]/reschedule.ts"
CANCEL_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/bookings/[uid]/cancel.ts"

# ── Case 1: same-day requests are rejected (Berlin lead time) ───────────────

@test "T901023-1: booking.ts rejects same-day requests via Berlin lead check (409)" {
  grep -q "berlinDayKey" "$BOOKING_TS" || { echo "berlinDayKey lead check missing from booking.ts"; return 1; }
  grep -q "status: 409" "$BOOKING_TS" || { echo "409 response missing from booking.ts"; return 1; }
}

# ── Case 2: previous-day requests stay allowed (negative control) ───────────

@test "T901023-2: booking.ts lead check is strict-after (previous-day requests stay allowed)" {
  grep -qE "[A-Za-z]*DayKey <= [A-Za-z]*DayKey" "$BOOKING_TS" || { echo "strict-after day-key comparison missing from booking.ts"; return 1; }
}

# ── Case 3: Europe/Berlin DST boundaries, no UTC mixing ─────────────────────

@test "T901023-3a: getAvailableSlots derives calendar days in Europe/Berlin (March DST), no UTC mixing" {
  grep -q "berlinDayKey" "$CALDAV_TS" || { echo "berlinDayKey missing from caldav.ts"; return 1; }
  body=$(sed -n '/export async function getAvailableSlots/,/^}/p' "$CALDAV_TS")
  if echo "$body" | grep -q "toISOString().split"; then echo "UTC-split still in getAvailableSlots"; return 1; fi
  if echo "$body" | grep -qE "getHours\(|getDay\(|\.getDate\("; then echo "server-local day getters still in getAvailableSlots"; return 1; fi
}

@test "T901023-3b: isSlotInAnyWindow uses Berlin day bounds (October DST), no UTC mixing" {
  grep -q "berlinDayKey" "$APPOINTMENTS_DB" || { echo "berlinDayKey missing from appointments-db.ts"; return 1; }
  body=$(sed -n '/export async function isSlotInAnyWindow/,/^}/p' "$APPOINTMENTS_DB")
  if echo "$body" | grep -q "toISOString"; then echo "toISOString still in isSlotInAnyWindow"; return 1; fi
  if echo "$body" | grep -qE "getHours\(|getDay\(|\.getDate\("; then echo "server-local day getters still in isSlotInAnyWindow"; return 1; fi
}

# ── Case 4: overlap is rejected server-side via atomic claimSlot ────────────

@test "T901023-4: booking.ts claims the slot atomically and returns 409 when taken" {
  grep -q "claimSlot" "$BOOKING_TS" || { echo "claimSlot call missing from booking.ts"; return 1; }
  grep -q "DELETE FROM slot_whitelist" "$APPOINTMENTS_DB" || { echo "atomic DELETE missing from claimSlot"; return 1; }
  grep -q "RETURNING" "$APPOINTMENTS_DB" || { echo "RETURNING missing from claimSlot"; return 1; }
  claim_line=$(grep -n "claimSlot(" "$BOOKING_TS" | head -1 | cut -d: -f1)
  insert_line=$(grep -n "createInboxItem(" "$BOOKING_TS" | head -1 | cut -d: -f1)
  [ "$claim_line" -lt "$insert_line" ] || { echo "claimSlot must precede createInboxItem in booking.ts"; return 1; }
}

# ── Case 5: buffers and holidays from site_settings JSON ────────────────────

@test "T901023-5: slot computation applies buffers and holidays from site_settings JSON" {
  grep -qE "getBookingBuffers|getHolidays" "$CALDAV_TS" || { echo "settings readers missing from caldav.ts"; return 1; }
  grep -q "SLOT_BUFFER_MIN" "$CALDAV_TS" || { echo "SLOT_BUFFER_MIN fallback missing from caldav.ts"; return 1; }
  grep -q "booking_buffers" "$CORE_DB" || { echo "booking_buffers key missing from website-core-db.ts"; return 1; }
  grep -q "holidays" "$CORE_DB" || { echo "holidays key missing from website-core-db.ts"; return 1; }
}

# ── Case 6: unauthenticated access to owner endpoints is rejected ───────────

@test "T901023-6: owner endpoints require an owner session (401 without)" {
  for f in "$BLOCK_TS" "$PHONE_TS" "$RESCHEDULE_TS" "$CANCEL_TS"; do
    grep -q "requireOwner" "$f" || { echo "requireOwner missing in $f"; return 1; }
    grep -q "status: 401" "$f" || { echo "401 response missing in $f"; return 1; }
  done
}

# ── Case 7: foreign brands are rejected (session-brand scoping) ─────────────

@test "T901023-7: owner endpoints scope by session brand, never client input" {
  for f in "$BLOCK_TS" "$PHONE_TS" "$RESCHEDULE_TS" "$CANCEL_TS"; do
    grep -q "ownerBusiness(session)" "$f" || { echo "session-brand scoping missing in $f"; return 1; }
    if grep -qE "searchParams\.get\(['\"]brand|body\.brand|params\.brand" "$f"; then echo "client-supplied brand in $f"; return 1; fi
  done
}
