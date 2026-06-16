#!/usr/bin/env bats
# FA-SF-38 — Layer-4 canary/rollback contract (observe_prod in feature-promote.sh)
SCRIPT="$BATS_TEST_DIRNAME/../../scripts/feature-promote.sh"
PHASES_SCRIPT="$BATS_TEST_DIRNAME/../../scripts/lib/promote-phases.sh"

setup() { load 'test_helper.bash'; }

@test "FA-SF-38: feature-promote.sh is syntactically valid bash" {
  run bash -n "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod() exists" {
  run grep -qE '^observe_prod\(\)' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod targets the LIVE site, not dev" {
  run grep -E 'web\.\$\{?brand|web\.\$\{cluster|web\.mentolder\.de|web\.korczewski\.de' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod captures pre-deploy revision before rollback" {
  run grep -qE 'rollout history|--to-revision' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod context comes from env-resolve, never dead prod_ctx" {
  run grep -qE 'env-resolve\.sh|ENV_CONTEXT' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}
