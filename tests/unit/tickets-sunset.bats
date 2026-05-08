#!/usr/bin/env bats
# tickets-sunset.bats — verifies the post-sunset DB state produced by
#   scripts/tickets-sunset.mjs
#
# Set TRACKING_DB_URL=postgres://website:…@localhost:5432/website
# Default fallback: postgres://website:website@localhost:5432/website
# Static tests (no DB) run unconditionally.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

setup() {
  PGURL="${TRACKING_DB_URL:-postgres://website:website@localhost:5432/website}"
  export PGURL PROJECT_DIR
  case "$PGURL" in
    *mentolder*|*korczewski*)
      skip "TRACKING_DB_URL points to a production host — refusing to run against live data"
      ;;
  esac
}

# ── Static checks ──────────────────────────────────────────────────

@test "static: sunset script exists" {
  [ -f "${PROJECT_DIR}/scripts/tickets-sunset.mjs" ]
}

@test "static: audit script exists" {
  [ -f "${PROJECT_DIR}/scripts/tickets-sunset-audit.mjs" ]
}

@test "static: sunset script is idempotent (uses IF EXISTS)" {
  grep -q 'IF EXISTS' "${PROJECT_DIR}/scripts/tickets-sunset.mjs"
}

@test "static: sunset script has --apply guard (dry-run default)" {
  grep -q "process.argv.includes('--apply')" "${PROJECT_DIR}/scripts/tickets-sunset.mjs"
}

# ── Runtime checks ─────────────────────────────────────────────────

object_gone() {
  local schema="$1" name="$2"
  local count
  count=$(psql "$PGURL" -t -A -c \
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='${schema}' AND c.relname='${name}'" 2>/dev/null) \
    || skip "No database available (set TRACKING_DB_URL)"
  [ "$count" = "0" ]
}

@test "runtime: bugs.bug_tickets view is gone" {
  object_gone bugs bug_tickets
}

@test "runtime: bugs.bug_tickets_legacy table is gone" {
  object_gone bugs bug_tickets_legacy
}

@test "runtime: bachelorprojekt.requirements view is gone" {
  object_gone bachelorprojekt requirements
}

@test "runtime: public.projects view is gone" {
  object_gone public projects
}

@test "runtime: public.sub_projects view is gone" {
  object_gone public sub_projects
}

@test "runtime: public.project_tasks view is gone" {
  object_gone public project_tasks
}

@test "runtime: public.project_attachments view is gone" {
  object_gone public project_attachments
}

@test "runtime: tickets.tickets table exists and is a base table" {
  psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1 || skip "No database available (set TRACKING_DB_URL)"
  local kind
  kind=$(psql "$PGURL" -t -A -c \
    "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tickets' AND c.relname='tickets'" 2>/dev/null)
  [ "$kind" = "r" ]
}

@test "runtime: tickets.tickets has rows" {
  psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1 || skip "No database available (set TRACKING_DB_URL)"
  local n
  n=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets" 2>/dev/null)
  [ "$n" -gt 0 ]
}

@test "runtime: tickets.ticket_activity exists" {
  psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1 || skip "No database available (set TRACKING_DB_URL)"
  local kind
  kind=$(psql "$PGURL" -t -A -c \
    "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tickets' AND c.relname='ticket_activity'" 2>/dev/null)
  [ "$kind" = "r" ]
}
