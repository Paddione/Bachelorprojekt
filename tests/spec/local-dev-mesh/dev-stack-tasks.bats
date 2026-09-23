#!/usr/bin/env bats
# tests/spec/local-dev-mesh/dev-stack-tasks.bats — T900332
# SSOT: openspec/changes/dev-stack-k3d-removal/specs/local-dev-mesh.md,
# Requirements "Dev redeploy pulls the CI-built dev image", "Dev secrets are materialised by an explicit task"

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT"
}

@test "dev:redeploy:website triggers rollout restart without local docker build" {
  command -v task >/dev/null 2>&1 || skip "task binary not installed"
  run task --dry dev:redeploy:website
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "rollout restart deploy/website"
  ! echo "$output" | grep -qE "(docker build|k3d image import)"
}

@test "dev:redeploy:brett triggers rollout restart without local docker build" {
  command -v task >/dev/null 2>&1 || skip "task binary not installed"
  run task --dry dev:redeploy:brett
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "rollout restart deploy/brett"
  ! echo "$output" | grep -qE "(docker build|k3d image import)"
}

@test "dev:secrets is present and targets NS_DEV" {
  command -v task >/dev/null 2>&1 || skip "task binary not installed"
  run task --dry dev:secrets
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "shared-db-dev-secrets"
  # Darf nicht im cert-manager Namespace anlegen
  ! echo "$output" | grep -qE "create namespace cert-manager|secret.*ipv64-api-key"
}
