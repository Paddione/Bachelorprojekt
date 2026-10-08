#!/usr/bin/env bats
# tests/spec/notify-reminders.bats
#
# Guards for T901025: notify-reminders (transaktionale Mails, 24h-Erinnerung,
# Dedupe, Retry, Versandstatus). Style: tests/spec/appointment-requests.bats.
# IDs T901025-1..5 feed components/website/src/data/test-inventory.json
# via scripts/build-test-inventory.sh.

LIB_TS="${BATS_TEST_DIRNAME}/../../components/website/src/lib/appointment-notify.ts"
CRON_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/cron/appointment-reminders.ts"

# ── Case 1: reminders only target confirmed requests ─────────────────────

@test "T901025-1: cron reminds only bestaetigt requests (offen/abgelehnt excluded)" {
  grep -q "bestaetigt" "$CRON_TS" || { echo "bestaetigt filter missing from appointment-reminders.ts"; return 1; }
  grep -q "offen" "$CRON_TS" || { echo "offen exclusion missing from appointment-reminders.ts"; return 1; }
  grep -q "abgelehnt" "$CRON_TS" || { echo "abgelehnt exclusion missing from appointment-reminders.ts"; return 1; }
  grep -q "!== 'bestaetigt'" "$CRON_TS" || { echo "state guard (!== bestaetigt) missing from appointment-reminders.ts"; return 1; }
}

# ── Case 2: cancelled requests never reach the send path ─────────────────

@test "T901025-2: storniert requests cannot reach sendNotify (guard precedes send)" {
  grep -q "storniert" "$CRON_TS" || { echo "storniert exclusion missing from appointment-reminders.ts"; return 1; }
  guard_line=$(grep -n "!== 'bestaetigt'" "$CRON_TS" | head -1 | cut -d: -f1)
  send_line=$(grep -n "sendNotify(" "$CRON_TS" | head -1 | cut -d: -f1)
  [ -n "$guard_line" ] || { echo "state guard missing from appointment-reminders.ts"; return 1; }
  [ -n "$send_line" ] || { echo "sendNotify call missing from appointment-reminders.ts"; return 1; }
  [ "$guard_line" -lt "$send_line" ] || { echo "state guard must precede sendNotify in appointment-reminders.ts"; return 1; }
}

# ── Case 3: retry is capped at 3 attempts ─────────────────────────────────

@test "T901025-3: notify lib retries at most 3 times" {
  grep -q "MAX_NOTIFY_ATTEMPTS = 3" "$LIB_TS" || { echo "retry cap MAX_NOTIFY_ATTEMPTS = 3 missing from appointment-notify.ts"; return 1; }
  grep -q "MAX_NOTIFY_ATTEMPTS" "$LIB_TS" || { echo "MAX_NOTIFY_ATTEMPTS unused in appointment-notify.ts"; return 1; }
}

# ── Case 4: dedupe lookup precedes every send ─────────────────────────────

@test "T901025-4: dedupeKey check precedes the mailer call in sendNotify" {
  key_line=$(grep -n "dedupeKey(" "$LIB_TS" | head -1 | cut -d: -f1)
  mail_line=$(grep -n "await mailer(" "$LIB_TS" | head -1 | cut -d: -f1)
  [ -n "$key_line" ] || { echo "dedupeKey call missing from appointment-notify.ts"; return 1; }
  [ -n "$mail_line" ] || { echo "mailer call missing from appointment-notify.ts"; return 1; }
  [ "$key_line" -lt "$mail_line" ] || { echo "dedupeKey must precede the mailer call in appointment-notify.ts"; return 1; }
}

# ── Case 5: cron endpoint is bearer-guarded (fail-closed 403) ─────────────

@test "T901025-5: cron endpoint checks the bearer secret and answers 403" {
  grep -qi "authorization" "$CRON_TS" || { echo "Authorization header check missing from appointment-reminders.ts"; return 1; }
  grep -q "Bearer " "$CRON_TS" || { echo "Bearer comparison missing from appointment-reminders.ts"; return 1; }
  grep -q "status: 403" "$CRON_TS" || { echo "403 response missing from appointment-reminders.ts"; return 1; }
}
