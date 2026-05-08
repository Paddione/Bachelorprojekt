#!/usr/bin/env bats
# Tests for scripts/migrate-tracking-to-tickets.mjs.
# Skips if no shared-db is reachable. Cleans up its own fixture rows.

load test_helper

PSQL="psql -X -A -t -v ON_ERROR_STOP=1"
SCRIPT="$BATS_TEST_DIRNAME/../../scripts/migrate-tracking-to-tickets.mjs"
EXT_REQ_FIX="MIGTEST-1"
EXT_PR_FIX="-99100"

setup() {
  if [[ "${TRACKING_DB_URL:-}" == "" ]]; then
    skip "TRACKING_DB_URL not set"
  fi
  if [[ "${TRACKING_DB_URL}" == *"web.mentolder.de"* || "${TRACKING_DB_URL}" == *"web.korczewski.de"* ]]; then
    skip "refusing to run against prod URL"
  fi
}

@test "migration: dry-run does not write" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bachelorprojekt' AND c.relname='requirements'" 2>/dev/null | grep -q '1 row' || \
    skip "bachelorprojekt.requirements does not exist (sunset already applied)"
  local before
  before=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.pr_events" | tr -d ' ')
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" >/dev/null
  local after
  after=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.pr_events" | tr -d ' ')
  [ "$before" = "$after" ]
}

@test "migration: --apply moves a fresh requirement row into tickets.tickets" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bachelorprojekt' AND c.relname='requirements'" 2>/dev/null | grep -q '1 row' || \
    skip "bachelorprojekt.requirements does not exist (sunset already applied)"
  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO bachelorprojekt.requirements (id, category, name, description, created_at)
     VALUES ('$EXT_REQ_FIX', 'FA', 'Migration test req', 'desc', now())
     ON CONFLICT DO NOTHING"
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT type, thesis_tag, title FROM tickets.tickets WHERE external_id='$EXT_REQ_FIX'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"feature"* ]]
  [[ "$output" == *"$EXT_REQ_FIX"* ]]
  [[ "$output" == *"Migration test req"* ]]
}

@test "migration: --apply twice is idempotent (no duplicates)" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bachelorprojekt' AND c.relname='requirements'" 2>/dev/null | grep -q '1 row' || \
    skip "bachelorprojekt.requirements does not exist (sunset already applied)"
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT COUNT(*) FROM tickets.tickets WHERE external_id='$EXT_REQ_FIX'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*1[[:space:]]*$ ]]
}

@test "migration: bachelorprojekt.v_timeline preserves required columns" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bachelorprojekt' AND c.relname='requirements'" 2>/dev/null | grep -q '1 row' || \
    skip "bachelorprojekt.requirements does not exist (sunset already applied)"
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT column_name FROM information_schema.columns
      WHERE table_schema='bachelorprojekt' AND table_name='v_timeline'
      ORDER BY column_name"
  [ "$status" -eq 0 ]
  for col in id day merged_at pr_number title description category scope brand requirement_id requirement_name; do
    [[ "$output" == *"$col"* ]] || { echo "missing column: $col"; return 1; }
  done
}

@test "migration: ticket_links row created when feature row had requirement_id" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bachelorprojekt' AND c.relname='requirements'" 2>/dev/null | grep -q '1 row' || \
    skip "bachelorprojekt.requirements does not exist (sunset already applied)"
  # Insert a base-table feature linked to our test requirement, then re-run migration.
  # If features is already a view, this test path is N/A (post-migration), so skip.
  local isTable
  isTable=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='features'" \
    | tr -d ' ')
  [ "$isTable" = "0" ] && skip "features already migrated to view; ticket_links path not exercisable here"

  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO bachelorprojekt.features (pr_number, title, category, requirement_id, merged_at)
     VALUES ($EXT_PR_FIX, 'pr', 'feat', '$EXT_REQ_FIX', now())
     ON CONFLICT (pr_number) DO NOTHING"
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null

  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT 1 FROM tickets.ticket_links tl
       JOIN tickets.tickets t ON t.id = tl.from_id
      WHERE t.external_id='$EXT_REQ_FIX'
        AND tl.kind='fixes'
        AND tl.pr_number=$EXT_PR_FIX"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*1[[:space:]]*$ ]]
}

teardown() {
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.ticket_links WHERE pr_number = $EXT_PR_FIX" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.pr_events WHERE pr_number = $EXT_PR_FIX" >/dev/null 2>&1 || true
  # Try both base table and view (only one will succeed)
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM bachelorprojekt.features_legacy WHERE pr_number = $EXT_PR_FIX" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.tickets WHERE external_id='$EXT_REQ_FIX'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM bachelorprojekt.requirements_legacy WHERE id='$EXT_REQ_FIX'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM bachelorprojekt.requirements WHERE id='$EXT_REQ_FIX'" >/dev/null 2>&1 || true
}
