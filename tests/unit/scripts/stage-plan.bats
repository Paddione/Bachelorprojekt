#!/usr/bin/env bats
# Tests for scripts/vda/ticket/stage-plan.sh

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  STAGE_PLAN="$REPO_ROOT/scripts/vda/ticket/stage-plan.sh"
}

@test "stage-plan rejects FACTORY-PLAN-REF pointing to nonexistent file" {
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/test" --plan "openspec/changes/nonexistent/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}

@test "stage-plan rejects empty plan path" {
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/test" --plan ""
  [ "$status" -eq 2 ]
  [[ "$output" == *"--plan is required"* ]]
}

@test "stage-plan rejects missing --id flag" {
  run bash "$STAGE_PLAN" --branch "feature/test" --plan "openspec/changes/test/tasks.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"--id is required"* ]]
}

@test "stage-plan rejects missing --branch flag" {
  run bash "$STAGE_PLAN" --id T000999 --plan "openspec/changes/test/tasks.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"--branch is required"* ]]
}

@test "stage-plan rejects missing --plan flag" {
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/test"
  [ "$status" -eq 2 ]
  [[ "$output" == *"--plan is required"* ]]
}
