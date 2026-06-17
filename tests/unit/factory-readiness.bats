#!/usr/bin/env bats
# bats file_tags=offline
# factory-readiness.bats — Unit tests for check_ticket_readiness (offline, local git fixture)

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
RC="${PROJECT_DIR}/scripts/factory/readiness-check.sh"

setup() {
  export PROJECT_DIR RC
  WORK="$(mktemp -d "${BATS_TEST_TMPDIR:-/tmp}/readiness.XXXXXX")"
  BARE="$WORK/origin.git"
  CLONE="$WORK/clone"
  git init --quiet --bare "$BARE"
  git clone --quiet "$BARE" "$CLONE"
  (
    cd "$CLONE"
    git config user.email t@t.test
    git config user.name test
    mkdir -p docs/superpowers/plans
    echo "# plan" > docs/superpowers/plans/test-plan.md
    git add -A
    git commit --quiet -m "add plan"
    git branch -M feature/has-plan
    git push --quiet -u origin feature/has-plan
  )
  export CLONE
}

teardown() { rm -rf "$WORK"; }

@test "readiness: missing args -> not ready, missing_args" {
  run bash "$RC" "" ""
  [ "$status" -eq 1 ]
  [[ "$output" == *'"ready":false'* ]]
  [[ "$output" == *'missing_args'* ]]
}

@test "readiness: branch not on origin -> not ready, no_branch" {
  run bash -c "cd '$CLONE' && bash '$RC' feature/does-not-exist docs/superpowers/plans/test-plan.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *'"ready":false'* ]]
  [[ "$output" == *'no_branch'* ]]
}

@test "readiness: plan file missing on branch -> not ready, no_plan_on_branch" {
  run bash -c "cd '$CLONE' && bash '$RC' feature/has-plan docs/superpowers/plans/missing.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *'"ready":false'* ]]
  [[ "$output" == *'no_plan_on_branch'* ]]
}

@test "readiness: branch + plan present -> ready, ok" {
  run bash -c "cd '$CLONE' && bash '$RC' feature/has-plan docs/superpowers/plans/test-plan.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ready":true'* ]]
  [[ "$output" == *'"reason":"ok"'* ]]
}
