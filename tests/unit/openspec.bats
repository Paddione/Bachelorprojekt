#!/usr/bin/env bats
# openspec.bats — scripts/openspec.sh CLI behaviour (verbs, exit codes, usage).
# Composition/structure validation is covered by scripts/openspec-validate.test.ts (Vitest).

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
OSX="$PROJECT_DIR/scripts/openspec.sh"

@test "unknown verb exits non-zero with usage" {
  run bash "$OSX" frobnicate
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* || "$output" == *"Unknown"* ]]
}
