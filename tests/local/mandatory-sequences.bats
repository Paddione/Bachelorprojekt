#!/usr/bin/env bats
# tests/local/mandatory-sequences.bats
# Regression test: verify critical task sequences still exist
# These sequences are documented in CLAUDE.md for cluster-reset and feature deployments

@test "cluster-reset sequence task exists: sealed-secrets:install" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "sealed-secrets:install"
}

@test "cluster-reset sequence task exists: env:fetch-cert" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "env:fetch-cert"
}

@test "cluster-reset sequence task exists: env:seal" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "env:seal"
}

@test "cluster-reset sequence task exists: cert:install" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "cert:install"
}

@test "cluster-reset sequence task exists: workspace:deploy" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "workspace:deploy"
}

@test "feature fan-out task exists: feature:website" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "feature:website"
}

@test "feature fan-out task exists: feature:brett" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "feature:brett"
}

@test "feature fan-out task exists: feature:deploy" {
  run task --list-all
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "feature:deploy"
}

# NOTE: the flux:sync / flux:status tasks were removed with the Flux GitOps
# teardown — fleet is push-based (no reconciler), so there is no flux task to assert.

@test "workspace:validate runs without error" {
  run task workspace:validate
  [ "$status" -eq 0 ]
}

@test "admin-actions migration file exists" {
  [ -f website/src/db/migrations/20260525_admin_actions.sql ]
}

@test "admin-api.ts helper exists and is valid" {
  [ -f website/src/lib/admin-api.ts ]
  grep -q "export async function apiCall" website/src/lib/admin-api.ts
}

@test "admin-api.ts exports toast function" {
  grep -q "export function toast" website/src/lib/admin-api.ts
}
