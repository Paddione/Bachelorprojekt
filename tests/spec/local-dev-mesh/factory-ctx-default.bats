#!/usr/bin/env bats
# tests/spec/local-dev-mesh/factory-ctx-default.bats — T900145
setup() { REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"; }

@test "explicit FACTORY_CTX wins (positive anchor)" {
  run env FACTORY_CTX=lab-cluster bash -c "source '$REPO_ROOT/scripts/factory/lib.sh'; printf 'CTX=%s\\n' \"\$FACTORY_CTX\""
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'CTX=lab-cluster'
}

@test "lib.sh without FACTORY_CTX resolves to fleet" {
  run env -u FACTORY_CTX bash -c "source '$REPO_ROOT/scripts/factory/lib.sh'; printf 'CTX=%s\\n' \"\$FACTORY_CTX\""
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'CTX=fleet'
}
