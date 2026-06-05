#!/usr/bin/env bats
# FA-SF-24: queue.sh lists backlog features as ordered JSON.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-24: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace"* ]]
}

@test "FA-SF-24: a seeded backlog feature appears in the queue JSON" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-queue-$$-a.txt")
  run env BRAND="$brand" bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; .external_id == $e)'
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
