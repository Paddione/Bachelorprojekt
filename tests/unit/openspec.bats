#!/usr/bin/env bats
# openspec.bats — scripts/openspec.sh verbs (propose/apply/archive/validate).
# validate runs fully offline (filesystem-only). propose/apply/archive cases that
# touch the DB skip when no ticket backend is reachable (TICKET_OFFLINE=1).

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
OSX="$PROJECT_DIR/scripts/openspec.sh"
FIX="$PROJECT_DIR/tests/unit/fixtures/openspec"

@test "validate passes a well-formed change tree" {
  run env OPENSPEC_ROOT="$FIX/valid" bash "$OSX" validate
  [ "$status" -eq 0 ]
}

@test "validate fails a wrong-heading-level delta (fail-closed)" {
  run env OPENSPEC_ROOT="$FIX/bad-heading" bash "$OSX" validate
  [ "$status" -ne 0 ]
  [[ "$output" == *"heading"* || "$output" == *"Requirement"* ]]
}

@test "validate fails when a delta directory is empty/missing requirement headers" {
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/changes/empty-change/specs"
  printf '# nothing here\n' > "$tmp/changes/empty-change/specs/cap.md"
  run env OPENSPEC_ROOT="$tmp" bash "$OSX" validate
  rm -rf "$tmp"
  [ "$status" -ne 0 ]
}

@test "unknown verb exits non-zero with usage" {
  run bash "$OSX" frobnicate
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* || "$output" == *"Unknown"* ]]
}
