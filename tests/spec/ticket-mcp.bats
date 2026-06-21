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
