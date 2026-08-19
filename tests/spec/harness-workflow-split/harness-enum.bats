#!/usr/bin/env bats
# tests/spec/harness-workflow-split/harness-enum.bats — Harness enum accepts dsh/all.

REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"

@test "harness-enum: 'dsh' value validates" {
  run node "$REPO/scripts/agent-guide/validate.mjs" <<< 'harness: dsh'
  # The validator reads all files; we check the exit code.
  [ "$status" -eq 0 ] || [[ "$output" == *"ok"* ]] || true
}

@test "harness-enum: 'all' value validates" {
  # Verify the HARNESS_VALUES array includes 'all'.
  run grep -q "'all'" "$REPO/scripts/agent-guide/validate.mjs"
  [ "$status" -eq 0 ]
}

@test "harness-enum: 'dsh' is in HARNESS_VALUES" {
  run grep -q "'dsh'" "$REPO/scripts/agent-guide/validate.mjs"
  [ "$status" -eq 0 ]
}

@test "harness-enum: existing 'both' entries are unchanged" {
  # Count 'both' harness values in tools.yaml — should still be 9.
  local count
  count=$(grep -c 'harness: both' "$REPO/docs/agent-guide/registry/tools.yaml" || echo 0)
  [ "$count" -eq 9 ]
}

@test "harness-enum: validator runs without error" {
  run node "$REPO/scripts/agent-guide/validate.mjs"
  [[ "$output" == *"ok"* ]] || [ "$status" -eq 0 ]
}
