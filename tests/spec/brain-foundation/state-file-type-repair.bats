#!/usr/bin/env bats
# Ticket: T012903 — State-Typ-Reparatur

HELPERS="$BATS_TEST_DIRNAME/../../../scripts/brain-ingest-reset.sh"

run_state_init() {
  run bash -c 'source "$1"; brain_ingest_initialize_state "$2" "$3"' \
    _ "$HELPERS" "$STATE_FILE" "${1:-0}"
}

@test "state file with array [] is repaired to empty object {}" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '[]' > "$STATE_FILE"

  run_state_init
  [ "$status" -eq 0 ]
  [ "$(cat "$STATE_FILE")" = '{}' ]
}

@test "state file with valid object is left unchanged" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '{"key":"val"}' > "$STATE_FILE"

  run_state_init
  [ "$status" -eq 0 ]
  [ "$(cat "$STATE_FILE")" = '{"key":"val"}' ]
}

@test "missing state file is created as empty object" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"

  run_state_init
  [ "$status" -eq 0 ]
  [ "$(cat "$STATE_FILE")" = '{}' ]
}

@test "invalid empty state is repaired" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  : > "$STATE_FILE"

  run_state_init
  [ "$status" -eq 0 ]
  [ "$(cat "$STATE_FILE")" = '{}' ]
}

@test "dry-run reports invalid state repair without modifying it" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '[]' > "$STATE_FILE"

  run_state_init 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"would repair non-object state file"* ]]
  [ "$(cat "$STATE_FILE")" = '[]' ]
}

@test "dry-run reports missing state initialization without creating it" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"

  run_state_init 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"would initialize missing state file"* ]]
  [ ! -e "$STATE_FILE" ]
}
