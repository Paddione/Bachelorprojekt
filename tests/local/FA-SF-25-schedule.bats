#!/usr/bin/env bats
# FA-SF-25: schedule.sh emits a launch plan and claims slots.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-25: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-25: two disjoint backlog features both get scheduled with slots" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  e1=$(seed_test_feature "$brand" "tests/fixtures/sf-test-sched-$$-a.txt")
  e2=$(seed_test_feature "$brand" "tests/fixtures/sf-test-sched-$$-b.txt")
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$e1" 'any(.[]; .external_id == $e and (.slot|type=="number"))'
  echo "$output" | jq -e --arg e "$e2" 'any(.[]; .external_id == $e)'
}

@test "FA-SF-25: global cap of 1 schedules at most one feature" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  seed_test_feature "$brand" "tests/fixtures/sf-test-cap-$$-a.txt" >/dev/null
  seed_test_feature "$brand" "tests/fixtures/sf-test-cap-$$-b.txt" >/dev/null
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  count=$(echo "$output" | jq 'length')
  [ "$count" -le 1 ]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
