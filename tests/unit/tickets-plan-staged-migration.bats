#!/usr/bin/env bats
# Offline-safe: prüft den Migrations-Quelltext in tickets-db.ts. Stellt sicher,
# dass 'plan_staged' im Status-CHECK steht und das Muster idempotent (drop+add) ist.
# Kein Cluster / keine DB nötig.

setup() { SRC="$BATS_TEST_DIRNAME/../../website/src/lib/tickets-db.ts"; }

@test "tickets-db: status CHECK enthält plan_staged" {
  run grep -F "'plan_staged'" "$SRC"
  [ "$status" -eq 0 ]
}

@test "tickets-db: status-Migration ist idempotent (DROP CONSTRAINT IF EXISTS)" {
  run grep -F "DROP CONSTRAINT IF EXISTS tickets_status_check" "$SRC"
  [ "$status" -eq 0 ]
}

@test "tickets-db: plan_staged steht zwischen planning und backlog im CHECK" {
  run grep -E "'planning','plan_staged','backlog'" "$SRC"
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
