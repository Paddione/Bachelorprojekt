#!/usr/bin/env bats
# FA-SF-23: slots.sh contract. Offline assertions always run; live claim/release
# runs only when a dev cluster is reachable (FACTORY_CTX/FACTORY_NS set to dev).
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-23: dry-resolve prints brand namespace" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/slots.sh count
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace"* ]]
}

@test "FA-SF-23: unknown subcommand exits 2" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE= bash scripts/factory/slots.sh bogus
  [ "$status" -eq 2 ]
}

@test "FA-SF-23: claim is atomic — second claim on the same ticket fails" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-slots-$$-a.txt")
  run env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
  run env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 2
  [ "$status" -eq 1 ]                       # already slotted → claim fails
  run env BRAND="$brand" bash scripts/factory/slots.sh release "$ext"
  [ "$status" -eq 0 ]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
