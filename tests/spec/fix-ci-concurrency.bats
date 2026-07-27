#!/usr/bin/env bats

# T002248: ci.yml concurrency guard — edited events must not cancel in-progress CI runs.

@test "ci.yml cancel-in-progress excludes edited events" {
  # The concurrency.cancel-in-progress expression must contain != 'edited'
  # so that PR-title edits (action: edited) do not cancel running CI jobs.
  run grep -A2 'cancel-in-progress:' .github/workflows/ci.yml
  [ "$status" -eq 0 ]
  [[ "$output" == *"!= 'edited'"* ]] || {
    echo "cancel-in-progress does not exclude 'edited' events"
    echo "Got: $output"
    return 1
  }
}

@test "ci.yml all jobs skip on edited action" {
  # Every job that should not run on edited events must have the guard.
  # Count jobs with if-guards vs total jobs (excluding commit-lint which
  # intentionally runs on edited via a different condition).
  local guarded
  guarded=$(grep -c "github.event.action != 'edited'" .github/workflows/ci.yml)
  # At least the core test jobs must be guarded (test-bats, test-manifests,
  # test-factory, security-scan, brett-typescript, vitest-website,
  # bundle-budget, lighthouse).
  [ "$guarded" -ge 8 ]
}
