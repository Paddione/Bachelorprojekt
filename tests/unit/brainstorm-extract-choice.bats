#!/usr/bin/env bats
# Tests for scripts/brainstorm-extract-choice.sh

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brainstorm-extract-choice.sh"

setup() {
  TESTDIR="$(mktemp -d)"
}

teardown() {
  rm -rf "$TESTDIR"
}

@test "extracts last choice from events file" {
  printf '{"type":"click","choice":"A","timestamp":1}\n' > "$TESTDIR/events"
  printf '{"type":"click","choice":"B","timestamp":2}\n' >> "$TESTDIR/events"
  run bash "$SCRIPT" "$TESTDIR"
  [ "$status" -eq 0 ]
  [ "$output" = "B" ]
}

@test "exits 1 when no events file" {
  run bash "$SCRIPT" "$TESTDIR"
  [ "$status" -eq 1 ]
}

@test "exits 1 when no choice event in file" {
  printf '{"type":"scroll","timestamp":1}\n' > "$TESTDIR/events"
  run bash "$SCRIPT" "$TESTDIR"
  [ "$status" -eq 1 ]
}
