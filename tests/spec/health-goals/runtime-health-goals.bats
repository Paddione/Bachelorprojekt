#!/usr/bin/env bats

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TOOL="$REPO/scripts/lib/runtime-health-measure.py"
  FIX="$REPO/tests/fixtures/health-goals/runtime"
}

assert_measure() {
  run python3 "$TOOL" "$1" --input "$FIX/$2"
  [ "$status" -eq 0 ]
  [ "$output" = "$3" ]
}

@test "flux counts unhealthy and fails closed on empty input" {
  assert_measure flux flux-ready.json 0
  assert_measure flux flux-unhealthy.json 2
  assert_measure flux empty-items.json -
}

@test "prometheus scrape health requires a non-empty target basis" {
  assert_measure scrape prometheus-up.json 0
  assert_measure scrape prometheus-down.json 1
  assert_measure scrape prometheus-empty.json -
}

@test "PVC headroom counts volumes below twenty percent" {
  assert_measure capacity pvc-healthy.json 0
  assert_measure capacity pvc-low.json 1
  assert_measure capacity prometheus-empty.json -
}

@test "axe counts only serious and critical findings across both brands" {
  assert_measure axe axe-clean.json 0
  assert_measure axe axe-findings.json 2
  assert_measure axe axe-incomplete.json -
}

@test "lighthouse returns the lower integer score and rejects incomplete reports" {
  assert_measure lighthouse lighthouse-valid.json 91
  assert_measure lighthouse lighthouse-low.json 78
  assert_measure lighthouse lighthouse-incomplete.json -
}

@test "SLO returns the worse brand in promille and requires complete history" {
  assert_measure slo slo-healthy.json 998
  assert_measure slo slo-low.json 991
  assert_measure slo slo-incomplete.json -
}

@test "health-goal IDs and guarded runtime invocations are registered" {
  for id in G-FLUX01 G-OBS01 G-CAP01 G-A11Y01 G-FE05 G-SLO01; do
    grep -q "row target $id" "$REPO/scripts/health-goals-check.sh"
    grep -q "\*\*$id\*\*" "$REPO/.claude/lib/goals.md"
  done
}
