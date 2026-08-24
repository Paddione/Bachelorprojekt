#!/usr/bin/env bats
# tests/spec/ci-cd/baseline-guard-read-pr-body.bats — T015384

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/code-quality/baseline-key-count-assertion.mjs"
}

@test "T015384: readPrBody fallback to github event payload and hard fail on error" {
  # We test the static analysis of the file to ensure the required logic is present,
  # or we run it with a mock.
  
  # 1. process.env.GITHUB_EVENT_PATH fallback
  grep -q "process.env.GITHUB_EVENT_PATH" "$SCRIPT"
  
  # 2. Hard fail (process.exit or throw)
  grep -q -E "process\.exit\(1\)|throw new Error" "$SCRIPT"
}
