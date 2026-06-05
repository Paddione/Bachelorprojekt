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
