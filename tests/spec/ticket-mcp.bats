#!/usr/bin/env bats

setup() {
  export FACTORY_DRY_RESOLVE=1
  export BRAND=mentolder
  REPO="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "ticket.sh list --dry-resolve exits 0" {
  run bash "$REPO/scripts/ticket.sh" list --brand mentolder
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "DRY-RESOLVE"
}

@test "ticket.sh list accepts --limit flag" {
  run bash "$REPO/scripts/ticket.sh" list --brand mentolder --limit 50
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "DRY-RESOLVE"
}

@test "ticket.sh list rejects unknown brand (via BRAND env)" {
  run env BRAND=unknown-brand bash "$REPO/scripts/ticket.sh" list
  [ "$status" -eq 2 ]
}

@test "ticket.sh backfill-id --dry-resolve exits 0" {
  run bash "$REPO/scripts/ticket.sh" backfill-id --brand mentolder
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "DRY-RESOLVE"
}

# ── link-tickets ─────────────────────────────────────────────────────────

@test "ticket.sh link-tickets rejects missing --from" {
  run bash "$REPO/scripts/ticket.sh" link-tickets --to T000002 --kind blocks
  [ "$status" -eq 2 ]
}

@test "ticket.sh link-tickets rejects missing --kind" {
  run bash "$REPO/scripts/ticket.sh" link-tickets --from T000001 --to T000002
  [ "$status" -eq 2 ]
}

@test "ticket.sh link-tickets rejects invalid kind value" {
  run bash "$REPO/scripts/ticket.sh" link-tickets --from T000001 --to T000002 --kind depends
  [ "$status" -eq 2 ]
  echo "$output" | grep -qi "kind"
}

@test "ticket.sh link-tickets offline skips write and exits 0" {
  run env TICKET_OFFLINE=1 bash "$REPO/scripts/ticket.sh" link-tickets \
    --from T000001 --to T000002 --kind blocks
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "OFFLINE"
}

# ── get-ticket-links ──────────────────────────────────────────────────────

@test "ticket.sh get-ticket-links rejects missing --id" {
  run bash "$REPO/scripts/ticket.sh" get-ticket-links
  [ "$status" -eq 2 ]
}

@test "ticket.sh get-ticket-links offline refuses read and exits 9" {
  run env TICKET_OFFLINE=1 bash "$REPO/scripts/ticket.sh" get-ticket-links --id T000001
  [ "$status" -eq 9 ]
}

# ── get-timeline ──────────────────────────────────────────────────────────

@test "ticket.sh get-timeline rejects missing --id" {
  run bash "$REPO/scripts/ticket.sh" get-timeline
  [ "$status" -eq 2 ]
}

@test "ticket.sh get-timeline offline refuses read and exits 9" {
  run env TICKET_OFFLINE=1 bash "$REPO/scripts/ticket.sh" get-timeline --id T000001
  [ "$status" -eq 9 ]
}
