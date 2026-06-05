#!/usr/bin/env bats
# FA-SF-22: factory shared lib + test fixtures contract (offline assertions only).
setup() { load 'test_helper.bash'; }

@test "FA-SF-22: lib.sh dry-resolve maps korczewski to workspace-korczewski" {
  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash -c 'source scripts/factory/lib.sh; factory_resolve; echo "ns=$FACTORY_NS ctx=$FACTORY_CTX"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace-korczewski"* ]]
}

@test "FA-SF-22: lib.sh rejects unknown BRAND" {
  run env BRAND=bogus bash -c 'source scripts/factory/lib.sh; factory_resolve'
  [ "$status" -eq 2 ]
}

@test "FA-SF-22: fixtures refuse to seed into prod fleet without override" {
  run env FACTORY_CTX=fleet bash -c 'source tests/lib/factory-test-fixtures.sh; seed_test_feature mentolder "tests/fixtures/x.txt"'
  [ "$status" -ne 0 ]
  [[ "$output" =~ "refusing" ]]
}
