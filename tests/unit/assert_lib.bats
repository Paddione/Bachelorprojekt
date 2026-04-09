#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# assert_lib.bats — Unit tests for tests/lib/assert.sh
# ═══════════════════════════════════════════════════════════════════
# Verifies the assertion library itself produces correct JSONL output
# and exit behavior. No cluster required.
# ═══════════════════════════════════════════════════════════════════

load test_helper

setup() {
  setup_results_file
  source "${PROJECT_DIR}/tests/lib/assert.sh"
}

# ── assert_eq ────────────────────────────────────────────────────

@test "assert_eq: pass when values match" {
  assert_eq "hello" "hello" "TEST" "T1" "values match"
  assert_equal "$(last_status)" "pass"
}

@test "assert_eq: fail when values differ" {
  assert_eq "hello" "world" "TEST" "T2" "values differ"
  assert_equal "$(last_status)" "fail"
  [[ "$(last_detail)" == *"Expected: world, Got: hello"* ]]
}

@test "assert_eq: handles empty strings" {
  assert_eq "" "" "TEST" "T3" "empty strings"
  assert_equal "$(last_status)" "pass"
}

# ── assert_contains ──────────────────────────────────────────────

@test "assert_contains: pass when needle found" {
  assert_contains "hello world" "world" "TEST" "T4" "needle found"
  assert_equal "$(last_status)" "pass"
}

@test "assert_contains: fail when needle missing" {
  assert_contains "hello world" "xyz" "TEST" "T5" "needle missing"
  assert_equal "$(last_status)" "fail"
}

# ── assert_not_contains ──────────────────────────────────────────

@test "assert_not_contains: pass when needle absent" {
  assert_not_contains "hello" "xyz" "TEST" "T6" "needle absent"
  assert_equal "$(last_status)" "pass"
}

@test "assert_not_contains: fail when needle present" {
  assert_not_contains "hello world" "world" "TEST" "T7" "needle present"
  assert_equal "$(last_status)" "fail"
}

# ── assert_lt ────────────────────────────────────────────────────

@test "assert_lt: pass when actual < max" {
  assert_lt 5 10 "TEST" "T8" "less than"
  assert_equal "$(last_status)" "pass"
}

@test "assert_lt: fail when actual >= max" {
  assert_lt 10 5 "TEST" "T9" "not less than"
  assert_equal "$(last_status)" "fail"
}

@test "assert_lt: fail on non-numeric input" {
  assert_lt "abc" 10 "TEST" "T10" "non-numeric"
  assert_equal "$(last_status)" "fail"
  [[ "$(last_detail)" == *"Non-numeric"* ]]
}

# ── assert_gt ────────────────────────────────────────────────────

@test "assert_gt: pass when actual > min" {
  assert_gt 10 5 "TEST" "T11" "greater than"
  assert_equal "$(last_status)" "pass"
}

@test "assert_gt: fail when actual <= min" {
  assert_gt 5 10 "TEST" "T12" "not greater than"
  assert_equal "$(last_status)" "fail"
}

# ── assert_match ─────────────────────────────────────────────────

@test "assert_match: pass when regex matches" {
  assert_match "v1.2.3" "^v[0-9]+\.[0-9]+\.[0-9]+$" "TEST" "T13" "semver match"
  assert_equal "$(last_status)" "pass"
}

@test "assert_match: fail when regex does not match" {
  assert_match "abc" "^[0-9]+$" "TEST" "T14" "no match"
  assert_equal "$(last_status)" "fail"
}

# ── assert_cmd ───────────────────────────────────────────────────

@test "assert_cmd: pass on successful command" {
  assert_cmd "true" "TEST" "T15" "true succeeds"
  assert_equal "$(last_status)" "pass"
}

@test "assert_cmd: fail on failing command" {
  assert_cmd "false" "TEST" "T16" "false fails"
  assert_equal "$(last_status)" "fail"
}

@test "assert_cmd: captures command output in detail" {
  assert_cmd "echo 'some error' && false" "TEST" "T17" "output captured"
  assert_equal "$(last_status)" "fail"
}

# ── skip_test ────────────────────────────────────────────────────

@test "skip_test: records skip status" {
  skip_test "TEST" "T18" "optional test" "not applicable"
  assert_equal "$(last_status)" "skip"
}

# ── JSONL output format ──────────────────────────────────────────

@test "output: each assertion produces valid JSON" {
  assert_eq "a" "a" "REQ" "T1" "first"
  assert_eq "a" "b" "REQ" "T2" "second"
  skip_test "REQ" "T3" "third"

  # Every line must be valid JSON
  while IFS= read -r line; do
    echo "$line" | jq . > /dev/null 2>&1
    assert_equal $? 0
  done < "$RESULTS_FILE"
}

@test "output: result contains all required fields" {
  assert_eq "x" "x" "FA-01" "T1" "field check"
  local result
  result=$(tail -1 "$RESULTS_FILE")

  echo "$result" | jq -e '.req'          > /dev/null
  echo "$result" | jq -e '.test'         > /dev/null
  echo "$result" | jq -e '.desc'         > /dev/null
  echo "$result" | jq -e '.status'       > /dev/null
  echo "$result" | jq -e '.duration_ms'  > /dev/null
  echo "$result" | jq -e '.detail'       > /dev/null
}

@test "output: duration_ms is a number" {
  assert_eq "a" "a" "TEST" "T1" "timing"
  local dur
  dur=$(tail -1 "$RESULTS_FILE" | jq '.duration_ms')
  [[ "$dur" =~ ^[0-9]+$ ]]
}

# ── assert_summary ───────────────────────────────────────────────

@test "assert_summary: returns 0 when no failures" {
  assert_eq "a" "a" "TEST" "T1" "pass"
  run assert_summary
  assert_success
  assert_output --partial "1 passed"
  assert_output --partial "0 failed"
}

@test "assert_summary: returns non-zero on failures" {
  assert_eq "a" "b" "TEST" "T1" "fail"
  run assert_summary
  assert_failure
  assert_output --partial "1 failed"
}
