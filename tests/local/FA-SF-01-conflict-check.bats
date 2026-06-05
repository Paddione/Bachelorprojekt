#!/usr/bin/env bats
# tests/local/factory-conflict-check.bats
# Verifies conflict-check.sh script behavior.

setup() {
  load 'test_helper.bash'
}

@test "FA-SF-01: conflict-check rejects missing args" {
  run bash scripts/factory/conflict-check.sh
  [ "$status" -eq 2 ]
  [[ "$output" =~ error ]]
}

@test "FA-SF-02: conflict-check returns error for unknown ticket without files" {
  # Set environment variables for the test to point to the dev database in k3d
  export FACTORY_CTX="k3d-korczewski-dev"
  export FACTORY_NS="workspace-korczewski-dev"
  run bash scripts/factory/conflict-check.sh "T999999"
  [ "$status" -eq 2 ]
  [[ "$output" =~ error ]]
}

@test "FA-SF-03: conflict-check with explicit files produces valid JSON" {
  # Set environment variables for the test to point to the dev database in k3d
  export FACTORY_CTX="k3d-korczewski-dev"
  export FACTORY_NS="workspace-korczewski-dev"
  
  # Ensure we have at least one ticket to test with, or insert/query safely
  run bash scripts/factory/conflict-check.sh "T000413" "website/src/lib/tickets-db.ts" "k3d/website-schema.yaml"
  # Verify the output is valid JSON (empty or array of conflicts)
  echo "$output" | jq . > /dev/null
}

@test "FA-SF-03b: BRAND=korczewski resolves namespace to workspace-korczewski" {
  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh T000001
  [ "$status" -eq 0 ]
  [[ "$output" == *"workspace-korczewski"* ]]
}

@test "FA-SF-04: conflict-check detects in-flight task tickets" {
  if [[ -z "${FACTORY_CTX:-}" ]]; then
    skip "FACTORY_CTX not set (live-seed test skipped)"
  fi
  source tests/lib/factory-test-fixtures.sh

  # Seed a feature ticket first
  local brand="korczewski"
  local file="k3d/configmap-domains.yaml"
  local ext_id
  ext_id=$(seed_test_feature "$brand" "$file")

  # Update it to be type='task' and status='in_progress' to simulate in-flight human work
  local ns="${FACTORY_NS:-workspace-korczewski-dev}"
  local pod
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET type='task', status='in_progress' WHERE external_id = '$ext_id';"

  # Verify conflict-check detects it for a different ticket ID
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" FACTORY_NS="$ns" \
    bash scripts/factory/conflict-check.sh "T999999" "$file"
  
  # Clean up before assert
  purge_factory_test_data "$brand"

  # Assert
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$ext_id" ]]
}
