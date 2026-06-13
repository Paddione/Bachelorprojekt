#!/usr/bin/env bats
# scripts/hooks/mishap-tracker.sh — records process frictions to a ticket comment
# (via ticket.sh add-comment) or, with no --ticket, to a local .mishaps.log.

setup() {
  TRACKER="$BATS_TEST_DIRNAME/../../scripts/hooks/mishap-tracker.sh"
  WORK="$(mktemp -d)"
  cd "$WORK"
}

teardown() { rm -rf "$WORK"; }

@test "no --ticket writes to .mishaps.log" {
  run bash "$TRACKER" --friction "ENV var missing" --severity minor
  [ "$status" -eq 0 ]
  [ -f .mishaps.log ]
  grep -q "ENV var missing" .mishaps.log
  grep -q "minor" .mishaps.log
}

@test "missing --friction fails with usage" {
  run bash "$TRACKER" --severity major
  [ "$status" -ne 0 ]
  [[ "$output" == *"--friction is required"* ]]
}

@test "default severity is minor" {
  run bash "$TRACKER" --friction "no severity given"
  [ "$status" -eq 0 ]
  grep -q "minor" .mishaps.log
}
