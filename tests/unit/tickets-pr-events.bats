#!/usr/bin/env bats
# Tests for tickets.pr_events table existence and shape (created by initTicketsSchema).
# Skips if no shared-db is reachable. Cleans up its own fixture rows.

load test_helper

PSQL="psql -X -A -t -v ON_ERROR_STOP=1"

setup() {
  if [[ "${TRACKING_DB_URL:-}" == "" ]]; then
    skip "TRACKING_DB_URL not set"
  fi
  if [[ "${TRACKING_DB_URL}" == *"web.mentolder.de"* || "${TRACKING_DB_URL}" == *"web.korczewski.de"* ]]; then
    skip "refusing to run against prod URL"
  fi
}

@test "pr_events: table exists with expected columns" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT column_name FROM information_schema.columns
      WHERE table_schema='tickets' AND table_name='pr_events' ORDER BY ordinal_position"
  [ "$status" -eq 0 ]
  [[ "$output" == *"pr_number"* ]]
  [[ "$output" == *"title"* ]]
  [[ "$output" == *"category"* ]]
  [[ "$output" == *"merged_at"* ]]
  [[ "$output" == *"status"* ]]
}

@test "pr_events: pr_number is PRIMARY KEY (rejects duplicates)" {
  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at)
     VALUES (-99001, 't', 'chore', now())"
  run $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at)
     VALUES (-99001, 't2', 'chore', now())"
  [ "$status" -ne 0 ]
  [[ "$output" == *"duplicate"* || "$output" == *"unique"* ]]
}

@test "pr_events: status check constraint rejects bogus values" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at, status)
     VALUES (-99002, 't', 'chore', now(), 'bogus')"
  [ "$status" -ne 0 ]
}

teardown() {
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.pr_events WHERE pr_number IN (-99001, -99002)" >/dev/null 2>&1 || true
}
