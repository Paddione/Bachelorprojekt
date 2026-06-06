#!/usr/bin/env bats
# FA-SF-34: directory-prefix conflict heuristic regression.
#   - two website/src/pages/ features stay PARALLEL (no conflict)
#   - two k3d/ features in the same dir SERIALIZE (conflict via prefix branch)
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }
teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }

@test "FA-SF-34: two website/src/pages features do NOT conflict (stay parallel)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "website/src/pages/foo.astro")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999998" "website/src/pages/bar.astro"
  [ "$status" -eq 0 ]
  [ "$output" = "[]" ]
}

@test "FA-SF-34: two k3d/ features in same dir DO conflict (serialize)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "k3d/website.yaml")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999997" "k3d/brett.yaml"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$existing" ]]
}

@test "FA-SF-34: exact-overlap base branch still conflicts (regression on @>)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "website/src/lib/shared.ts")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999996" "website/src/lib/shared.ts"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$existing" ]]
}
