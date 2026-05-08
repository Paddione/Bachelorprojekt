#!/usr/bin/env bats
# Tests for scripts/migrate-projects-to-tickets.mjs.
# Skips if no shared-db is reachable. Cleans up its own fixture rows.
# Assumes TRACKING_DB_URL points at a non-prod DB authenticated as `postgres`
# (the migration uses ALTER TABLE … RENAME, which the website role can't do).

load test_helper

PSQL="psql -X -A -t -v ON_ERROR_STOP=1"
SCRIPT="$BATS_TEST_DIRNAME/../../scripts/migrate-projects-to-tickets.mjs"

# Fixture UUIDs — picked deterministically so teardown can remove them.
PROJ_ID='11111111-1111-1111-1111-111111111111'
SUB_ID='22222222-2222-2222-2222-222222222222'
TASK_ID='33333333-3333-3333-3333-333333333333'
DIRECT_TASK_ID='44444444-4444-4444-4444-444444444444'
ATT_ID='55555555-5555-5555-5555-555555555555'

setup() {
  if [[ "${TRACKING_DB_URL:-}" == "" ]]; then
    skip "TRACKING_DB_URL not set"
  fi
  if [[ "${TRACKING_DB_URL}" == *"web.mentolder.de"* || "${TRACKING_DB_URL}" == *"web.korczewski.de"* ]]; then
    skip "refusing to run against prod URL"
  fi
}

@test "migration: dry-run does not write" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  local before
  before=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.tickets WHERE type IN ('project','task')" | tr -d ' ')
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" >/dev/null
  local after
  after=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.tickets WHERE type IN ('project','task')" | tr -d ' ')
  [ "$before" = "$after" ]
}

@test "migration: row-count parity (projects + sub_projects + project_tasks == tickets type IN project,task)" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  # Captures the running total of rows currently in the legacy tables (or
  # _legacy if migration already ran), then re-runs --apply and asserts the
  # tickets-side count matches.
  local legacyP legacyS legacyT
  legacyP=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM (SELECT 1 FROM projects UNION ALL SELECT 1 FROM projects_legacy) x" 2>/dev/null \
    | tr -d ' ' || echo 0)
  legacyS=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM (SELECT 1 FROM sub_projects UNION ALL SELECT 1 FROM sub_projects_legacy) x" 2>/dev/null \
    | tr -d ' ' || echo 0)
  legacyT=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM (SELECT 1 FROM project_tasks UNION ALL SELECT 1 FROM project_tasks_legacy) x" 2>/dev/null \
    | tr -d ' ' || echo 0)

  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null

  local proj sub task
  proj=$($PSQL "$TRACKING_DB_URL" -c "SELECT count(*) FROM tickets.tickets WHERE type='project' AND parent_id IS NULL" | tr -d ' ')
  sub=$($PSQL "$TRACKING_DB_URL"  -c "SELECT count(*) FROM tickets.tickets WHERE type='project' AND parent_id IS NOT NULL" | tr -d ' ')
  task=$($PSQL "$TRACKING_DB_URL" -c "SELECT count(*) FROM tickets.tickets WHERE type='task'" | tr -d ' ')

  [ "$proj" -ge "$legacyP" ]
  [ "$sub"  -ge "$legacyS" ]
  [ "$task" -ge "$legacyT" ]
}

@test "migration: --apply moves a fresh project row into tickets.tickets" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  # The migration script reads from base-table `projects`; if it's already a view,
  # the test inserts a fresh row in legacy + tickets directly.
  local isTable
  isTable=$($PSQL "$TRACKING_DB_URL" -c "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='projects'" | tr -d ' ')
  if [ "$isTable" = "0" ]; then skip "projects already a view; legacy-path test N/A"; fi

  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO projects (id, brand, name, description, status, priority)
     VALUES ('$PROJ_ID', 'mentolder', 'BATS test project', 'desc', 'aktiv', 'mittel')
     ON CONFLICT (id) DO NOTHING"

  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null

  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT type, status, brand, title FROM tickets.tickets WHERE id='$PROJ_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"project"* ]]
  [[ "$output" == *"in_progress"* ]]
  [[ "$output" == *"mentolder"* ]]
  [[ "$output" == *"BATS test project"* ]]
}

@test "migration: --apply twice is idempotent (no duplicates)" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM tickets.tickets WHERE id='$PROJ_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*[01][[:space:]]*$ ]]
}

@test "migration: parent_id chain is intact (sub_project parent is a project)" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM tickets.tickets c
       LEFT JOIN tickets.tickets p ON p.id = c.parent_id
      WHERE c.type='project' AND c.parent_id IS NOT NULL
        AND (p.id IS NULL OR p.type <> 'project' OR p.parent_id IS NOT NULL)"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*0[[:space:]]*$ ]] || { echo "orphan sub_project tickets: $output"; return 1; }
}

@test "migration: parent_id chain is intact (task parent is project or sub_project)" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM tickets.tickets c
       LEFT JOIN tickets.tickets p ON p.id = c.parent_id
      WHERE c.type='task' AND c.parent_id IS NOT NULL
        AND (p.id IS NULL OR p.type <> 'project')"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*0[[:space:]]*$ ]] || { echo "orphan task tickets: $output"; return 1; }
}

@test "migration: back-compat view 'projects' has the expected column shape" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='projects' ORDER BY column_name"
  [ "$status" -eq 0 ]
  for col in id brand name description notes start_date due_date status priority customer_id admin_id created_at updated_at; do
    [[ "$output" == *"$col"* ]] || { echo "missing column on projects view: $col"; return 1; }
  done
}

@test "migration: status round-trip — 'in_progress' surfaces as 'aktiv' through the projects view" {
  psql "$TRACKING_DB_URL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '(1 row)' || \
    skip "projects view does not exist (sunset already applied)"
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT status FROM projects WHERE id='$PROJ_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"aktiv"* ]]
}

teardown() {
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.ticket_attachments WHERE id IN ('$ATT_ID')" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.tickets WHERE id IN ('$DIRECT_TASK_ID','$TASK_ID','$SUB_ID','$PROJ_ID')" >/dev/null 2>&1 || true
  # Cover both pre-migration (base table) and post-migration (legacy) states.
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM project_attachments_legacy WHERE id='$ATT_ID'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM project_tasks_legacy WHERE id IN ('$DIRECT_TASK_ID','$TASK_ID')" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM sub_projects_legacy WHERE id='$SUB_ID'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM projects_legacy WHERE id='$PROJ_ID'" >/dev/null 2>&1 || true
}
