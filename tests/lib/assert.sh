#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# assert.sh — Lightweight test assertion library
# ═══════════════════════════════════════════════════════════════════
# Usage: source this file, then call assert_* functions.
# Each assertion appends a JSON line to $RESULTS_FILE.
#
# Required env vars:
#   RESULTS_FILE — path to the JSONL results file (one JSON object per line)
#   VERBOSE      — "true" to print each assertion to stdout
# ═══════════════════════════════════════════════════════════════════

_ASSERT_PASS=0
_ASSERT_FAIL=0
_ASSERT_SKIP=0

# Colors
_A_GREEN='\033[0;32m'; _A_RED='\033[0;31m'
_A_YELLOW='\033[1;33m'; _A_NC='\033[0m'

# ── Internal: log one result ─────────────────────────────────────
_log_result() {
  local req="$1" test_id="$2" desc="$3" status="$4" duration_ms="$5" detail="${6:-}"

  [[ -n "${RESULTS_FILE:-}" ]] || { echo "ERROR: RESULTS_FILE is not set" >&2; return 1; }

  jq -cn --arg req "$req" --arg test "$test_id" --arg desc "$desc" \
        --arg status "$status" --argjson dur "$duration_ms" --arg detail "$detail" \
    '{req: $req, test: $test, desc: $desc, status: $status, duration_ms: $dur, detail: $detail}' \
    >> "$RESULTS_FILE"

  if [[ "$status" == "pass" ]]; then
    ((_ASSERT_PASS++)) || true
    [[ "${VERBOSE:-}" == "true" ]] && echo -e "  ${_A_GREEN}✓${_A_NC} ${req}/${test_id}: ${desc}"
  elif [[ "$status" == "fail" ]]; then
    ((_ASSERT_FAIL++)) || true
    echo -e "  ${_A_RED}✗${_A_NC} ${req}/${test_id}: ${desc}"
    [[ -n "$detail" ]] && echo -e "    ${_A_RED}→ ${detail}${_A_NC}"
  else
    ((_ASSERT_SKIP++)) || true
    [[ "${VERBOSE:-}" == "true" ]] && echo -e "  ${_A_YELLOW}⊘${_A_NC} ${req}/${test_id}: ${desc} (skipped)"
  fi
}

_now_ms() { date +%s%3N; }

assert_eq() {
  local actual="$1" expected="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  if [[ "$actual" == "$expected" ]]; then
    _log_result "$req" "$test_id" "$desc" "pass" "$(( $(_now_ms) - start ))"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$(( $(_now_ms) - start ))" "Expected: ${expected}, Got: ${actual}"
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  if [[ "$haystack" == *"$needle"* ]]; then
    _log_result "$req" "$test_id" "$desc" "pass" "$(( $(_now_ms) - start ))"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$(( $(_now_ms) - start ))" "String '${needle}' not found"
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  if [[ "$haystack" != *"$needle"* ]]; then
    _log_result "$req" "$test_id" "$desc" "pass" "$(( $(_now_ms) - start ))"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$(( $(_now_ms) - start ))" "String '${needle}' should not be present"
  fi
}

assert_http() {
  local expected_status="$1" url="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  local actual_status
  actual_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
  local dur=$(( $(_now_ms) - start ))
  if [[ "$actual_status" == "$expected_status" ]]; then
    _log_result "$req" "$test_id" "$desc" "pass" "$dur"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$dur" "Expected HTTP ${expected_status}, Got: ${actual_status}"
  fi
}

assert_http_redirect() {
  local url="$1" expected_location="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  local location
  location=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 "$url" 2>/dev/null || echo "")
  local dur=$(( $(_now_ms) - start ))
  if [[ "$location" == *"$expected_location"* ]]; then
    _log_result "$req" "$test_id" "$desc" "pass" "$dur"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$dur" "Expected redirect to ${expected_location}, Got: ${location}"
  fi
}

assert_lt() {
  local actual="$1" max="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  if ! [[ "$actual" =~ ^-?[0-9]+$ ]] || ! [[ "$max" =~ ^-?[0-9]+$ ]]; then
    _log_result "$req" "$test_id" "$desc" "fail" "0" "Non-numeric input: actual='${actual}' max='${max}'"
    return
  fi
  if (( actual < max )); then
    _log_result "$req" "$test_id" "$desc" "pass" "$(( $(_now_ms) - start ))"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$(( $(_now_ms) - start ))" "Expected < ${max}, Got: ${actual}"
  fi
}

assert_gt() {
  local actual="$1" min="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  if ! [[ "$actual" =~ ^-?[0-9]+$ ]] || ! [[ "$min" =~ ^-?[0-9]+$ ]]; then
    _log_result "$req" "$test_id" "$desc" "fail" "0" "Non-numeric input: actual='${actual}' min='${min}'"
    return
  fi
  if (( actual > min )); then
    _log_result "$req" "$test_id" "$desc" "pass" "$(( $(_now_ms) - start ))"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$(( $(_now_ms) - start ))" "Expected > ${min}, Got: ${actual}"
  fi
}

assert_cmd() {
  local cmd="$1" req="$2" test_id="$3" desc="$4"
  local start; start=$(_now_ms)
  local output
  if output=$(bash -c "$cmd" 2>&1); then
    _log_result "$req" "$test_id" "$desc" "pass" "$(( $(_now_ms) - start ))"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$(( $(_now_ms) - start ))" "Command failed: ${output:0:200}"
  fi
}

assert_match() {
  local string="$1" regex="$2" req="$3" test_id="$4" desc="$5"
  local start; start=$(_now_ms)
  if [[ "$string" =~ $regex ]]; then
    _log_result "$req" "$test_id" "$desc" "pass" "$(( $(_now_ms) - start ))"
  else
    _log_result "$req" "$test_id" "$desc" "fail" "$(( $(_now_ms) - start ))" "String did not match pattern: ${regex}"
  fi
}

skip_test() {
  local req="$1" test_id="$2" desc="$3" reason="${4:-}"
  _log_result "$req" "$test_id" "$desc" "skip" "0" "$reason"
}

assert_summary() {
  local pass fail skip total
  if [[ -n "${RESULTS_FILE:-}" && -s "$RESULTS_FILE" ]]; then
    pass=$(grep -c '"status":"pass"' "$RESULTS_FILE" 2>/dev/null) || pass=0
    fail=$(grep -c '"status":"fail"' "$RESULTS_FILE" 2>/dev/null) || fail=0
    skip=$(grep -c '"status":"skip"' "$RESULTS_FILE" 2>/dev/null) || skip=0
  else
    pass=$_ASSERT_PASS
    fail=$_ASSERT_FAIL
    skip=$_ASSERT_SKIP
  fi
  total=$(( pass + fail + skip ))
  echo ""
  echo -e "  ${_A_GREEN}${pass} passed${_A_NC}, ${_A_RED}${fail} failed${_A_NC}, ${_A_YELLOW}${skip} skipped${_A_NC} (${total} total)"
  [[ $fail -eq 0 ]]
}
