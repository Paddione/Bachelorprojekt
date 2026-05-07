#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# tickets-reporter-link.bats — Unit/integration tests for
#   website/src/lib/tickets/reporter-link.ts
# ═══════════════════════════════════════════════════════════════════
# Runtime tests (linkReporterByEmail, linkAllReporters) require a live
# PostgreSQL database with the `customers` and `tickets.tickets` tables.
#
# Set TRACKING_DB_URL (or SESSIONS_DATABASE_URL) to your website DB URL.
# Default fallback: postgres://postgres:postgres@localhost:5432/website
#
# TypeScript is executed via `npx tsx` (tsx is not bundled in the
# project's devDependencies; npx will download it on demand or use the
# locally cached version). If running offline, set TSX_BIN to a local
# path, e.g.: TSX_BIN=/usr/local/bin/tsx bats tests/unit/tickets-reporter-link.bats
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
TSX_BIN="${TSX_BIN:-npx tsx}"

setup() {
  PGURL="${TRACKING_DB_URL:-${SESSIONS_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/website}}"
  export PGURL
  export PROJECT_DIR
}

# ── Helper ────────────────────────────────────────────────────────

# Returns 0 if psql can reach the target DB, 1 otherwise.
db_available() {
  psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1
}

# ── Static checks (no DB required) ───────────────────────────────

@test "reporter-link.ts file exists" {
  [ -f "${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts" ]
}

@test "reporter-link.ts exports linkReporterByEmail" {
  grep -q "export async function linkReporterByEmail" \
    "${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts"
}

@test "reporter-link.ts exports linkAllReporters" {
  grep -q "export async function linkAllReporters" \
    "${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts"
}

@test "linkReporterByEmail uses parameterized query (no string interpolation)" {
  # Ensure SQL uses $1 placeholder, not template literals, for the email value.
  grep -q '\$1' "${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts"
}

@test "both functions check reporter_id IS NULL (idempotency guard)" {
  # Match only the SQL clause form (t.reporter_id IS NULL) to avoid counting the JSDoc comment.
  count=$(grep -c "t\.reporter_id IS NULL" "${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts")
  [ "$count" -eq 2 ]
}

@test "both functions filter on keycloak_user_id IS NOT NULL" {
  count=$(grep -c "keycloak_user_id IS NOT NULL" "${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts")
  [ "$count" -eq 2 ]
}

# ── Runtime tests (require live DB) ──────────────────────────────

@test "linkReporterByEmail sets reporter_id when email matches a keycloak-linked customer" {
  if ! db_available; then
    skip "No database available (set TRACKING_DB_URL)"
  fi

  psql "$PGURL" >/dev/null <<SQL
    INSERT INTO customers (id, name, email, keycloak_user_id)
      VALUES ('11111111-1111-1111-1111-111111111111', 'Test User', 'link-test@example.com', 'kc-1')
      ON CONFLICT (email) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id;
    DELETE FROM tickets.tickets WHERE id = '22222222-2222-2222-2222-222222222222';
    INSERT INTO tickets.tickets (id, type, brand, title, reporter_email)
      VALUES ('22222222-2222-2222-2222-222222222222', 'bug', 'mentolder', 'T', 'link-test@example.com');
SQL

  SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { linkReporterByEmail } from '${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts';
    linkReporterByEmail('link-test@example.com').then(() => process.exit(0));
  "

  result=$(psql "$PGURL" -t -A -c \
    "SELECT reporter_id::text FROM tickets.tickets WHERE id='22222222-2222-2222-2222-222222222222'")
  [ "$result" = "11111111-1111-1111-1111-111111111111" ]

  # Cleanup
  psql "$PGURL" -c "DELETE FROM tickets.tickets WHERE id='22222222-2222-2222-2222-222222222222'" >/dev/null
}

@test "linkReporterByEmail returns 0 when email matches no customer" {
  if ! db_available; then
    skip "No database available (set TRACKING_DB_URL)"
  fi

  result=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { linkReporterByEmail } from '${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts';
    linkReporterByEmail('does-not-exist-${RANDOM}@example.com').then(n => { console.log(n); process.exit(0); });
  ")
  [ "$result" = "0" ]
}

@test "linkAllReporters links unlinked tickets in batch" {
  if ! db_available; then
    skip "No database available (set TRACKING_DB_URL)"
  fi

  psql "$PGURL" >/dev/null <<SQL
    INSERT INTO customers (id, name, email, keycloak_user_id)
      VALUES ('33333333-3333-3333-3333-333333333333', 'Batch User', 'batch-test@example.com', 'kc-batch')
      ON CONFLICT (email) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id;
    DELETE FROM tickets.tickets WHERE id = '44444444-4444-4444-4444-444444444444';
    INSERT INTO tickets.tickets (id, type, brand, title, reporter_email)
      VALUES ('44444444-4444-4444-4444-444444444444', 'bug', 'mentolder', 'Batch T', 'batch-test@example.com');
SQL

  linked=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { linkAllReporters } from '${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts';
    linkAllReporters().then(n => { console.log(n); process.exit(0); });
  ")
  # At least one row must have been linked
  [ "$linked" -ge 1 ]

  result=$(psql "$PGURL" -t -A -c \
    "SELECT reporter_id::text FROM tickets.tickets WHERE id='44444444-4444-4444-4444-444444444444'")
  [ "$result" = "33333333-3333-3333-3333-333333333333" ]

  # Cleanup
  psql "$PGURL" -c "DELETE FROM tickets.tickets WHERE id='44444444-4444-4444-4444-444444444444'" >/dev/null
}

@test "linkReporterByEmail is idempotent (second call returns 0)" {
  if ! db_available; then
    skip "No database available (set TRACKING_DB_URL)"
  fi

  psql "$PGURL" >/dev/null <<SQL
    INSERT INTO customers (id, name, email, keycloak_user_id)
      VALUES ('55555555-5555-5555-5555-555555555555', 'Idem User', 'idem-test@example.com', 'kc-idem')
      ON CONFLICT (email) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id;
    DELETE FROM tickets.tickets WHERE id = '66666666-6666-6666-6666-666666666666';
    INSERT INTO tickets.tickets (id, type, brand, title, reporter_email)
      VALUES ('66666666-6666-6666-6666-666666666666', 'bug', 'mentolder', 'Idem T', 'idem-test@example.com');
SQL

  # First call links the row
  SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { linkReporterByEmail } from '${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts';
    linkReporterByEmail('idem-test@example.com').then(() => process.exit(0));
  "

  # Second call must return 0 (already linked, reporter_id IS NULL guard fires)
  second=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { linkReporterByEmail } from '${PROJECT_DIR}/website/src/lib/tickets/reporter-link.ts';
    linkReporterByEmail('idem-test@example.com').then(n => { console.log(n); process.exit(0); });
  ")
  [ "$second" = "0" ]

  # Cleanup
  psql "$PGURL" -c "DELETE FROM tickets.tickets WHERE id='66666666-6666-6666-6666-666666666666'" >/dev/null
}
