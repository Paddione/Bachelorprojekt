#!/usr/bin/env bats
# Offline-safe: prüft den Migrations-Quelltext in tickets/migrations.ts. Stellt sicher,
# dass 'plan_staged' im Status-CHECK steht und das Muster idempotent (drop+add) ist.
# Kein Cluster / keine DB nötig.
# As of T001155 (G-RH01 Batch 2), the status-CHECK migration lives in
# tickets/migrations.ts. #2114 (G-CQ07) moved initTicketsSchema() into
# tickets-schema.ts, which must still call applyLegacyMigrations(pool) so the
# migration gets installed.

setup() {
  SRC="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets-schema.ts"
  TMIG="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/migrations.ts"
}

@test "tickets: status CHECK enthält plan_staged" {
  # The status CHECK lives in the legacy-migrations module since Batch 2.
  run grep -F "'plan_staged'" "$TMIG"
  [ "$status" -eq 0 ]
}

@test "tickets: status-Migration ist idempotent (DROP CONSTRAINT IF EXISTS)" {
  run grep -F "DROP CONSTRAINT IF EXISTS tickets_status_check" "$TMIG"
  [ "$status" -eq 0 ]
}

@test "tickets: plan_staged steht zwischen planning und backlog im CHECK" {
  run grep -E "'planning','plan_staged','backlog'" "$TMIG"
  [ "$status" -eq 0 ]
}

@test "tickets-schema.ts calls applyLegacyMigrations(pool) (regression guard for the split)" {
  # Without this call, the status-CHECK migration above would never install.
  run grep -E "applyLegacyMigrations\([[:space:]]*pool[[:space:]]*\)" "$SRC"
  [ "$status" -eq 0 ]
}

@test "status.ts ist die Status-SSOT: exportiert alle 11 kanonischen Status (T007955)" {
  STS="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/status.ts"
  for s in triage planning plan_staged backlog in_progress in_review qa_review blocked awaiting_deploy done archived; do
    run grep -F "$s" "$STS"
    [ "$status" -eq 0 ]
  done
}

@test "status.ts exportiert SSOT-Surface (TICKET_STATUSES, VALID_STATUSES, isValidStatus, TicketStatus)" {
  STS="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/status.ts"
  for pat in "export const TICKET_STATUSES" "export const VALID_STATUSES" "export function isValidStatus" "export type TicketStatus"; do
    run grep -F "$pat" "$STS"
    [ "$status" -eq 0 ]
  done
}

@test "Consumers importieren aus status.ts statt lokaler Duplikate (T007955)" {
  ADMIN="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/admin.ts"
  TRANS="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/transition.ts"
  COCKPIT_DB="$BATS_TEST_DIRNAME/../../components/website/src/lib/sdlc/tickets/cockpit-db.ts"
  ROUTE="$BATS_TEST_DIRNAME/../../components/website/src/pages/sdlc/api/cockpit/ticket-status.ts"
  run grep -F "from './status'" "$ADMIN"
  [ "$status" -eq 0 ]
  run grep -F "from './status'" "$TRANS"
  [ "$status" -eq 0 ]
  run grep -F "tickets/status" "$COCKPIT_DB"
  [ "$status" -eq 0 ]
  run grep -F "lib/tickets/status" "$ROUTE"
  [ "$status" -eq 0 ]
}
