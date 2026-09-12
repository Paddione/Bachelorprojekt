#!/usr/bin/env bats
# Tests for tickets.github_issue_snapshots, github_pr_snapshots, and github_sync_cursors.
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

@test "github_snapshots: snapshot tables and cursor table exist" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT table_name FROM information_schema.tables
      WHERE table_schema='tickets' AND table_name IN ('github_issue_snapshots', 'github_pr_snapshots', 'github_sync_cursors')
      ORDER BY table_name"
  [ "$status" -eq 0 ]
  [[ "$output" == *"github_issue_snapshots"* ]]
  [[ "$output" == *"github_pr_snapshots"* ]]
  [[ "$output" == *"github_sync_cursors"* ]]
}

@test "github_sync_cursors: accepts cursor upserts" {
  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.github_sync_cursors (id, cursor, synced_count)
     VALUES ('test_cursor', 'c_123', 5)
     ON CONFLICT (id) DO UPDATE SET cursor = EXCLUDED.cursor, synced_count = EXCLUDED.synced_count"
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT cursor, synced_count FROM tickets.github_sync_cursors WHERE id='test_cursor'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"c_123|5"* ]]
}

teardown() {
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.github_sync_cursors WHERE id = 'test_cursor'" >/dev/null 2>&1 || true
}
