#!/usr/bin/env bats
# FA-SF-53: pipeline-decompose — offline unit tests for the decomposition helper.
MOD="scripts/factory/pipeline-decompose.cjs"
SUITE="scripts/factory/pipeline-decompose.test.cjs"

@test "FA-SF-53: pipeline-decompose.cjs exists and is syntactically valid" {
  [ -f "$MOD" ]
  run node --check "$MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-53: node --test suite passes" {
  run node --test "$SUITE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"fail 0"* ]]
}

@test "FA-SF-53: exports the six contract functions" {
  for fn in "chooseModel" "chooseEffort" "buildContextHints" "provision" "assignFiles" "validateDisjoint"; do
    run grep -Fq "$fn" "$MOD"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-53: exports via module.exports (CommonJS)" {
  run grep -q "module.exports" "$MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-53: defines SHARED_FILE_LIST with the three shared files" {
  run grep -Fq "configmap-domains.yaml" "$MOD"
  [ "$status" -eq 0 ]
  run grep -Fq "environments/schema.yaml" "$MOD"
  [ "$status" -eq 0 ]
  run grep -Fq "k3d/kustomization.yaml" "$MOD"
  [ "$status" -eq 0 ]
}
