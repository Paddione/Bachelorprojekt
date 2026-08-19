#!/usr/bin/env bats
# tests/spec/brain-foundation/state-file-type-repair.bats
# Ticket: T012903 — State-Typ-Reparatur
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Jeder Test
# fuehrt die State-Initialisierung des Ingest-Skripts aus und prueft den
# Dateiinhalt — nicht den Quelltext des Skripts.
#
INGEST="$BATS_TEST_DIRNAME/../../../scripts/brain-ingest.sh"

setup() {
  export LM_MODEL="test-model"
  export BRAIN_INGEST_TEST_STOP_AFTER_STATE_INIT=1
  BRAIN_DIR="$BATS_TEST_TMPDIR/brain"
  mkdir -p "$BRAIN_DIR/wiki"
  git -C "$BRAIN_DIR" init -q -b main
  git -C "$BRAIN_DIR" config user.email "test@example.invalid"
  git -C "$BRAIN_DIR" config user.name "Test"
}

run_state_init() {
  run bash "$INGEST" --brain-repo "$BRAIN_DIR" --state "$STATE_FILE"
}

@test "state file with array [] is repaired to empty object {}" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '[]' > "$STATE_FILE"

  run_state_init
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{}' ]
}

@test "state file with valid object {\"key\":\"val\"} is left unchanged" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '{"key":"val"}' > "$STATE_FILE"

  run_state_init
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{"key":"val"}' ]
}

@test "missing state file is created as empty object {}" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"

  run_state_init
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{}' ]
}

@test "state file with empty string is repaired to {}" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '' > "$STATE_FILE"

  run_state_init
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{}' ]
}
