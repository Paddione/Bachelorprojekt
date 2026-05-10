#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# tickets-migration.bats — Idempotency tests for
#   scripts/migrate-bugs-to-tickets.mjs
# ═══════════════════════════════════════════════════════════════════
# Static tests run without a database. Runtime tests require a live
# PostgreSQL instance with both bugs.bug_tickets and tickets.* schemas.
#
# Set TRACKING_DB_URL to your website DB URL.
# Default fallback: postgres://postgres:postgres@localhost:5432/website
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

setup() {
  PGURL="${TRACKING_DB_URL:-postgres://postgres:postgres@localhost:5432/website}"
  export PGURL
  export PROJECT_DIR

  # Safety guard: refuse to run against production databases.
  case "$PGURL" in
    *mentolder*|*korczewski*)
      skip "TRACKING_DB_URL points to a production host — refusing to run against live data"
      ;;
  esac
}

# ── Static checks (no DB required) ───────────────────────────────

@test "static: migration script exists and is idempotent (uses external_id check)" {
  [ -f "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" ]
  grep -q 'WHERE external_id = \$1' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: apply mode wraps in BEGIN/COMMIT/ROLLBACK transaction" {
  grep -q "apply ? 'BEGIN'" "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" || \
  grep -q 'if (apply) await client.query' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'COMMIT'   "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'ROLLBACK' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: dry-run mode supported (default, --apply flag required)" {
  grep -q "process.argv.includes('--apply')" "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'dryRun' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: STATUS_MAP covers open->triage, resolved->done+fixed, archived->archived+fixed" {
  grep -q "open.*triage"    "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q "resolved.*done"  "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q "archived"        "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q "'fixed'"         "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: CATEGORY_TAG maps all three bug categories to kind: tags" {
  grep -q 'fehler.*kind:bug'              "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'verbesserung.*kind:improvement' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'erweiterungswunsch.*kind:wish' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: title is description sliced to 200 chars" {
  grep -q 'slice(0, 200)' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: resolution_note migrated as status_change comment with author_label=migration" {
  grep -q "'migration'" "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q "'status_change'" "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'resolution_note' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: output JSON includes inserted, skipped, and mode fields" {
  grep -q 'inserted' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'skipped'  "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'mode'     "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: script syntax is valid (node --check)" {
  node --check "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

# ── Runtime tests (require live DB) ──────────────────────────────

db_available() {
  psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1
}

@test "runtime: every bugs.bug_tickets row produces one tickets.tickets row" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  before=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets")
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  after=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  [ "$before" = "$after" ]
}

@test "runtime: status mapping is correct (open->triage, resolved->done+fixed)" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  open_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE status='open'")
  triage_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='triage'")
  [ "$open_count" = "$triage_count" ]
  resolved_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE status='resolved'")
  done_fixed_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='done' AND resolution='fixed'")
  [ "$resolved_count" = "$done_fixed_count" ]
}

@test "runtime: archived rows map to status=archived resolution=fixed" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  archived_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE status='archived'")
  mapped_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='archived' AND resolution='fixed'")
  [ "$archived_count" = "$mapped_count" ]
}

@test "runtime: category tags are created (kind:bug for fehler rows)" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  fehler_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE category='fehler'")
  if [ "$fehler_count" = "0" ]; then skip "No fehler rows in bugs.bug_tickets"; fi
  tag_count=$(psql "$PGURL" -t -A -c "
    SELECT count(DISTINCT tt.ticket_id)
      FROM tickets.ticket_tags tt
      JOIN tickets.tags tg ON tg.id = tt.tag_id
      JOIN tickets.tickets t ON t.id = tt.ticket_id
     WHERE tg.name = 'kind:bug' AND t.type = 'bug'")
  [ "$tag_count" = "$fehler_count" ]
}

@test "runtime: resolution_note rows produce a status_change comment" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  with_note=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE resolution_note IS NOT NULL AND resolution_note <> ''")
  if [ "$with_note" = "0" ]; then skip "No rows with resolution_note in bugs.bug_tickets"; fi
  comment_count=$(psql "$PGURL" -t -A -c "
    SELECT count(*) FROM tickets.ticket_comments
     WHERE kind='status_change' AND author_label='migration'")
  [ "$comment_count" = "$with_note" ]
}

@test "runtime: idempotent — second run does not duplicate" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  count1=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  count2=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  [ "$count1" = "$count2" ]
}

@test "runtime: idempotent — second run reports all rows as skipped" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  total=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets")
  output=$(node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply 2>&1)
  skipped=$(echo "$output" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['skipped'])" 2>/dev/null)
  [ "$skipped" = "$total" ]
}

@test "runtime: dry-run (default) makes no changes to tickets table" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  before=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" >/dev/null
  after=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  [ "$before" = "$after" ]
}

@test "runtime: dry-run output JSON has mode=dry-run" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  output=$(node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" 2>&1)
  echo "$output" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['mode'] == 'dry-run', f'expected dry-run, got {d[\"mode\"]}'
print('OK')
"
}

@test "runtime: comments are copied" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1; then skip "No database available"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  expected=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_ticket_comments")
  actual=$(psql "$PGURL" -t -A -c "
    SELECT count(*) FROM tickets.ticket_comments tc
    JOIN tickets.tickets t ON t.id = tc.ticket_id
    WHERE t.type = 'bug' AND tc.kind <> 'system' AND tc.author_label <> 'migration'")
  [ "$actual" -ge "$expected" ]
}

@test "runtime: fixed_in_pr → ticket_links" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1; then skip "No database available"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  expected=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE fixed_in_pr IS NOT NULL")
  actual=$(psql "$PGURL" -t -A -c "
    SELECT count(*) FROM tickets.ticket_links WHERE kind='fixes' AND pr_number IS NOT NULL")
  [ "$actual" = "$expected" ]
}

@test "static: extension blocks present (comments + screenshots + fixed_in_pr)" {
  grep -q 'bug_ticket_comments' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'screenshots_json' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'ticket_attachments' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'ticket_links' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q "kind='fixes'" "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "static: view-creation block is guarded by !dryRun" {
  grep -q 'CREATE OR REPLACE VIEW bugs.bug_tickets' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'pg_tables' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
  grep -q 'bug_tickets_legacy' "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs"
}

@test "runtime: bugs.bug_tickets is a view after migration" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1; then skip "No database available"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  result=$(psql "$PGURL" -t -A -c "
    SELECT relkind FROM pg_class
     WHERE relname='bug_tickets' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='bugs')")
  # 'r' = ordinary table, 'v' = view, 'm' = materialized view
  [ "$result" = "v" ]
}

@test "runtime: legacy fixed_in_pr JOIN still works against the view" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1; then skip "No database available"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  # The query mirrors the one in website/src/lib/website-db.ts line 88-91
  psql "$PGURL" -c "
    SELECT fixed_in_pr AS pr, COUNT(*)::int AS n
      FROM bugs.bug_tickets
     WHERE fixed_in_pr = ANY('{1,2,3,99999}'::int[])
     GROUP BY fixed_in_pr" >/dev/null
}

@test "runtime: re-running migration is idempotent (view not corrupted)" {
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  if ! psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1; then skip "No database available"; fi
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  node "${PROJECT_DIR}/scripts/migrate-bugs-to-tickets.mjs" --apply >/dev/null
  result=$(psql "$PGURL" -t -A -c "
    SELECT relkind FROM pg_class
     WHERE relname='bug_tickets' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='bugs')")
  [ "$result" = "v" ]
}
