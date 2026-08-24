#!/usr/bin/env bats
# tests/spec/software-factory/factory-runner.bats
# SSOT: openspec/changes/wsl-exit-factory-runner/specs/software-factory.md [T016433]

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  DEPLOY="${REPO_ROOT}/prod-fleet/dev/factory-runner.yaml"
}

@test "factory-runner is single-replica with Recreate strategy" {
  grep -q "name: factory-runner" "$DEPLOY"
  run awk '/kind: Deployment/,/^---/' "$DEPLOY"
  echo "$output" | grep -q "replicas: 1"
  echo "$output" | grep -A2 "strategy:" | grep -q "type: Recreate"
}

@test "cronjob wraps wakeup.sh in timeout (RuntimeMaxSec equivalent) and forbids concurrency" {
  grep -q "concurrencyPolicy: Forbid" "$DEPLOY"
  grep -q "timeout 3600 bash scripts/factory/wakeup.sh" "$DEPLOY"
}

@test "no plaintext secret manifests for runner credentials" {
  # Es darf kein Klartext-Secret-Manifest mit den Credential-Keys committet sein;
  # die Credentials kommen ausschließlich als SealedSecret via Operator-Skript.
  local bad
  bad=$(grep -rln "name: factory-runner-secrets" "${REPO_ROOT}/prod-fleet" \
    | xargs -r grep -l "^kind: Secret$" || true)
  [ -z "$bad" ]
  [ -f "${REPO_ROOT}/scripts/factory/seal-factory-secrets.sh" ]
  bash -n "${REPO_ROOT}/scripts/factory/seal-factory-secrets.sh"
}

@test "runner mounts pvc workdir and env file paths match deployment env" {
  grep -q "claimName: factory-workdir" "$DEPLOY"
  grep -q 'value: /run/factory-env/autopilot.env' "$DEPLOY"
}
