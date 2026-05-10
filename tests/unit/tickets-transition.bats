#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# tickets-transition.bats — Unit/integration tests for
#   website/src/lib/tickets/transition.ts
# ═══════════════════════════════════════════════════════════════════
# Runtime tests require a live PostgreSQL database with the tickets
# schema already applied (run initTicketsSchema() once).
#
# Set TRACKING_DB_URL (or SESSIONS_DATABASE_URL) to your website DB URL.
# Default fallback: postgres://postgres:postgres@localhost:5432/website
#
# TypeScript is executed via `npx tsx`. If running offline set TSX_BIN
# to a local path, e.g.: TSX_BIN=/usr/local/bin/tsx bats tests/unit/tickets-transition.bats
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
TSX_BIN="${TSX_BIN:-npx tsx}"

setup() {
  PGURL="${TRACKING_DB_URL:-${SESSIONS_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/website}}"
  export PGURL
  export PROJECT_DIR

  # Safety guard: refuse to run against production databases.
  case "$PGURL" in
    *mentolder*|*korczewski*)
      echo "TRACKING_DB_URL points to a production host ($PGURL). Aborting to protect live data." >&2
      exit 1
      ;;
  esac

  export TICKET_ID="33333333-3333-3333-3333-333333333333"
}

teardown() {
  if psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1; then
    psql "$PGURL" >/dev/null 2>&1 <<SQL || true
      DELETE FROM tickets.ticket_links  WHERE from_id = '$TICKET_ID';
      DELETE FROM tickets.ticket_comments WHERE ticket_id = '$TICKET_ID';
      DELETE FROM tickets.ticket_activity WHERE ticket_id = '$TICKET_ID';
      DELETE FROM tickets.tickets WHERE id = '$TICKET_ID';
SQL
  fi
}

# ── Helper ────────────────────────────────────────────────────────

db_available() {
  psql "$PGURL" -c "SELECT 1" >/dev/null 2>&1
}

# tsx runtime tests require website/node_modules (including pg) to be installed.
tsx_available() {
  [[ -d "${PROJECT_DIR}/website/node_modules/pg" ]]
}

seed_ticket() {
  local status="${1:-triage}"
  psql "$PGURL" >/dev/null <<SQL
    DELETE FROM tickets.ticket_links  WHERE from_id = '$TICKET_ID';
    DELETE FROM tickets.ticket_comments WHERE ticket_id = '$TICKET_ID';
    DELETE FROM tickets.ticket_activity WHERE ticket_id = '$TICKET_ID';
    DELETE FROM tickets.tickets WHERE id = '$TICKET_ID';
    INSERT INTO tickets.tickets (id, type, brand, title, status, reporter_email, external_id)
      VALUES ('$TICKET_ID', 'bug', 'mentolder', 'Transition Test', '$status',
              'rep-test@example.com', 'BR-19990101-0001');
SQL
}

# ── Static checks (no DB required) ───────────────────────────────

@test "static: transition.ts file exists" {
  [ -f "${PROJECT_DIR}/website/src/lib/tickets/transition.ts" ]
}

@test "static: exports transitionTicket" {
  grep -q 'export async function transitionTicket' \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: exports TicketStatus type" {
  grep -q 'export type TicketStatus' \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: exports TicketResolution type" {
  grep -q 'export type TicketResolution' \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: exports TransitionResult interface" {
  grep -q 'export interface TransitionResult' \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: rejects done without resolution at validation level" {
  grep -q 'requires a resolution' \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: uses pool.connect() not bare pool.query for transaction" {
  grep -q 'pool\.connect()' \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: BEGIN/COMMIT/ROLLBACK transaction flow present" {
  grep -q "BEGIN"    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
  grep -q "COMMIT"   "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
  grep -q "ROLLBACK" "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: sets app.user_label session config" {
  grep -q "app.user_label" \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: sets app.user_id session config" {
  grep -q "app.user_id" \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: calls linkReporterByEmail before sendBugCloseEmail" {
  local file="${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
  local link_line close_line
  # Skip import lines; look for the actual await call sites.
  link_line=$(grep -n 'await linkReporterByEmail' "$file" | head -1 | cut -d: -f1)
  close_line=$(grep -n 'await sendBugCloseEmail' "$file" | head -1 | cut -d: -f1)
  [ -n "$link_line" ]
  [ -n "$close_line" ]
  [ "$link_line" -lt "$close_line" ]
}

@test "static: email only sent when noteVisibility is public (public note guard)" {
  grep -q "noteVisibility === 'public'" \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

@test "static: becomingDone guard checks before.status !== done" {
  grep -q "before.status !== 'done'" \
    "${PROJECT_DIR}/website/src/lib/tickets/transition.ts"
}

# ── Runtime: validation errors (no DB needed) ─────────────────────

@test "runtime: rejects unknown status" {
  if ! tsx_available; then skip "website/node_modules not installed (run npm install in website/)"; fi
  output=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('00000000-0000-0000-0000-000000000000', { status: 'banana' as any, actor: { label: 'test' } })
      .then(() => console.log('OK'))
      .catch(e => console.log('ERR:' + e.message));
  " 2>&1)
  [[ "$output" == *"ERR:"*"invalid status"* ]]
}

@test "runtime: rejects done without resolution" {
  if ! tsx_available; then skip "website/node_modules not installed (run npm install in website/)"; fi
  output=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('00000000-0000-0000-0000-000000000000', { status: 'done', actor: { label: 'test' } })
      .then(() => console.log('OK'))
      .catch(e => console.log('ERR:' + e.message));
  " 2>&1)
  [[ "$output" == *"ERR:"*"resolution"* ]]
}

@test "runtime: rejects archived without resolution" {
  if ! tsx_available; then skip "website/node_modules not installed (run npm install in website/)"; fi
  output=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('00000000-0000-0000-0000-000000000000', { status: 'archived', actor: { label: 'test' } })
      .then(() => console.log('OK'))
      .catch(e => console.log('ERR:' + e.message));
  " 2>&1)
  [[ "$output" == *"ERR:"*"resolution"* ]]
}

@test "runtime: rejects unknown resolution" {
  if ! tsx_available; then skip "website/node_modules not installed (run npm install in website/)"; fi
  output=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('00000000-0000-0000-0000-000000000000', { status: 'done', resolution: 'banana' as any, actor: { label: 'test' } })
      .then(() => console.log('OK'))
      .catch(e => console.log('ERR:' + e.message));
  " 2>&1)
  [[ "$output" == *"ERR:"*"invalid resolution"* ]]
}

# ── Runtime: DB-required tests ───────────────────────────────────

@test "runtime: triage -> done sets resolution and done_at" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  seed_ticket "triage"

  SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('$TICKET_ID', { status: 'done', resolution: 'fixed', actor: { label: 'test' } })
      .then(r => { console.log(JSON.stringify(r)); process.exit(0); })
      .catch(e => { console.error(e.message); process.exit(1); });
  "

  result=$(psql "$PGURL" -t -A -c \
    "SELECT status||','||resolution||','||CASE WHEN done_at IS NULL THEN 'null' ELSE 'set' END
       FROM tickets.tickets WHERE id='$TICKET_ID'")
  [ "$result" = "done,fixed,set" ]
}

@test "runtime: triage -> backlog -> in_progress sets started_at" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  seed_ticket "backlog"

  SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('$TICKET_ID', { status: 'in_progress', actor: { label: 'test' } })
      .then(() => process.exit(0))
      .catch(e => { console.error(e.message); process.exit(1); });
  "

  result=$(psql "$PGURL" -t -A -c \
    "SELECT CASE WHEN started_at IS NULL THEN 'null' ELSE 'set' END
       FROM tickets.tickets WHERE id='$TICKET_ID'")
  [ "$result" = "set" ]
}

@test "runtime: note is inserted as status_change comment" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  seed_ticket "triage"

  SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('$TICKET_ID', {
      status: 'done',
      resolution: 'fixed',
      note: 'shipped in v1.2',
      noteVisibility: 'internal',
      actor: { label: 'admin' }
    }).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
  "

  count=$(psql "$PGURL" -t -A -c \
    "SELECT COUNT(*) FROM tickets.ticket_comments
       WHERE ticket_id='$TICKET_ID' AND kind='status_change' AND body='shipped in v1.2'")
  [ "$count" = "1" ]
}

@test "runtime: prNumber creates ticket_links row" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  seed_ticket "in_review"

  SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('$TICKET_ID', {
      status: 'done',
      resolution: 'shipped',
      prNumber: 42,
      actor: { label: 'ci' }
    }).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
  "

  count=$(psql "$PGURL" -t -A -c \
    "SELECT COUNT(*) FROM tickets.ticket_links
       WHERE from_id='$TICKET_ID' AND kind='fixes' AND pr_number=42")
  [ "$count" = "1" ]
}

@test "runtime: prNumber link is idempotent (second call is no-op)" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  seed_ticket "in_review"

  for _i in 1 2; do
    SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
      import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
      transitionTicket('$TICKET_ID', {
        status: 'done',
        resolution: 'shipped',
        prNumber: 99,
        actor: { label: 'ci' }
      }).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
    "
    # Re-seed to done so second call can re-enter (already done -> done is fine)
  done

  count=$(psql "$PGURL" -t -A -c \
    "SELECT COUNT(*) FROM tickets.ticket_links
       WHERE from_id='$TICKET_ID' AND kind='fixes' AND pr_number=99")
  [ "$count" = "1" ]
}

@test "runtime: ticket not found throws error" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi

  output=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('ffffffff-ffff-ffff-ffff-ffffffffffff', { status: 'backlog', actor: { label: 'test' } })
      .then(() => console.log('OK'))
      .catch(e => console.log('ERR:' + e.message));
  " 2>&1)
  [[ "$output" == *"ERR:"*"not found"* ]]
}

@test "runtime: audit log entry created on transition" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  seed_ticket "triage"

  SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('$TICKET_ID', {
      status: 'backlog',
      actor: { label: 'reviewer' }
    }).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
  "

  count=$(psql "$PGURL" -t -A -c \
    "SELECT COUNT(*) FROM tickets.ticket_activity
       WHERE ticket_id='$TICKET_ID' AND field='_updated'")
  [ "$count" -ge 1 ]
}

@test "runtime: TransitionResult shape is correct" {
  if ! db_available; then skip "No database available (set TRACKING_DB_URL)"; fi
  seed_ticket "triage"

  result=$(SESSIONS_DATABASE_URL="$PGURL" $TSX_BIN -e "
    import { transitionTicket } from '${PROJECT_DIR}/website/src/lib/tickets/transition.ts';
    transitionTicket('$TICKET_ID', { status: 'done', resolution: 'wontfix', actor: { label: 'test' } })
      .then(r => console.log(JSON.stringify(r)))
      .catch(e => { console.error(e.message); process.exit(1); });
  " 2>&1)

  echo "$result" | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert 'id' in r, 'missing id'
assert 'externalId' in r, 'missing externalId'
assert 'type' in r, 'missing type'
assert 'status' in r, 'missing status'
assert 'resolution' in r, 'missing resolution'
assert 'emailSent' in r, 'missing emailSent'
assert r['status'] == 'done', f'expected done, got {r[\"status\"]}'
assert r['resolution'] == 'wontfix', f'expected wontfix, got {r[\"resolution\"]}'
print('shape OK')
"
}
