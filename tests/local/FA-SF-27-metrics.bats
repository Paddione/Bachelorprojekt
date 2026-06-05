#!/usr/bin/env bats
# FA-SF-27: metrics.sh summarizes v_factory_metrics and posts a comment.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-27: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/metrics.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-27: posts a comment to a seeded metrics ticket" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  # Use a throwaway test ticket as the metrics sink so we don't touch T000413.
  sink=$(seed_test_feature "$brand" "tests/fixtures/sf-test-metrics-$$-a.txt")
  run env BRAND="$brand" FACTORY_METRICS_TICKET="$sink" bash scripts/factory/metrics.sh
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Comment added" ]] || [[ "$output" =~ "Factory metrics" ]]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
