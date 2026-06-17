#!/usr/bin/env bats
# tests/unit/vda-factory-slots.bats
# Offline test: vda.sh factory slots dispatch + output formatting.
# Uses FACTORY_DRY_RESOLVE to avoid cluster dependency.

VDA_SH="$BATS_TEST_DIRNAME/../../scripts/vda.sh"

@test "vda.sh factory slots help exits 0 and lists actions" {
  run bash "$VDA_SH" factory slots help
  [ "$status" -eq 0 ]
  [[ "$output" == *"count"* ]]
  [[ "$output" == *"next"* ]]
  [[ "$output" == *"claim"* ]]
  [[ "$output" == *"release"* ]]
}

@test "vda.sh factory slots bogus exits 2" {
  run bash "$VDA_SH" factory slots bogus
  [ "$status" -eq 2 ]
}

@test "vda.sh factory bogus exits 2" {
  run bash "$VDA_SH" factory bogus
  [ "$status" -eq 2 ]
}

@test "vda.sh factory slots count dry-resolve plaintext" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash "$VDA_SH" factory slots count
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace"* ]]
}

@test "vda.sh factory slots count --json" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash "$VDA_SH" factory slots count --json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"action":"count"'* ]]
  [[ "$output" == *'"brand":"mentolder"'* ]]
}
