#!/usr/bin/env bats
# Offline-safe: prüft den Migrations-Quelltext in tickets-db.ts. Stellt sicher,
# dass 'plan_staged' im Status-CHECK steht und das Muster idempotent (drop+add) ist.
# Kein Cluster / keine DB nötig.
# As of T001155 (G-RH01 Batch 2), the status-CHECK migration lives in
# tickets/migrations.ts. The compat re-export in tickets-db.ts must still call
# applyLegacyMigrations(pool) so the migration gets installed.

setup() {
  SRC="$BATS_TEST_DIRNAME/../../website/src/lib/tickets-db.ts"
  TMIG="$BATS_TEST_DIRNAME/../../website/src/lib/tickets/migrations.ts"
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

@test "tickets-db.ts calls applyLegacyMigrations(pool) (regression guard for the split)" {
  # Without this call, the status-CHECK migration above would never install.
  run grep -E "applyLegacyMigrations\([[:space:]]*pool[[:space:]]*\)" "$SRC"
  [ "$status" -eq 0 ]
}

@test "admin.ts TicketStatus-Union enthält plan_staged" {
  run grep -F "plan_staged" "$BATS_TEST_DIRNAME/../../website/src/lib/tickets/admin.ts"
  [ "$status" -eq 0 ]
}

@test "transition.ts TicketStatus-Union + VALID_STATUSES enthält plan_staged" {
  run grep -c "plan_staged" "$BATS_TEST_DIRNAME/../../website/src/lib/tickets/transition.ts"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}
