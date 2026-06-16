#!/usr/bin/env bats
# FA-SF-37-retry — structured ≤2 self-healing retry loop in pipeline.js
PJS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.js"

setup() { load 'test_helper.bash'; }

@test "FA-SF-37-retry: pipeline.js lints clean (node --check)" {
  run node --check "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: old LLM prose is gone" {
  run grep -F 'after 2 fix attempts' "$PJS"
  [ "$status" -ne 0 ]
}

@test "FA-SF-37-retry: reads retry_count via ticket.sh (no raw SQL)" {
  run grep -qE 'ticket\.sh retry-count get' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: two-gated classification (failure-class AND path-class)" {
  run grep -qE 'classify-failure\.sh' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'paths_are_escalate_class|classify-paths\.sh' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: auto-fix gated to ci/test/lint only" {
  run grep -qE 'ci.*test.*lint|\{ci,test,lint\}|ci/test/lint' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: at retry_count>=2 → blocked + PushNotification" {
  run grep -qE 'retry_count.*2|retry-count.*incr' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'PushNotification' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: Verify HIGH/CRITICAL immediate-block stays separate" {
  run grep -qE "reason: 'review-findings'" "$PJS"
  [ "$status" -eq 0 ]
}

# ── build-loop (ralph-wiggum) tests ──
BLS="$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.sh"

@test "FA-SF-37-retry: build-loop.sh sourcet sauber" {
  run bash -n "$BLS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: build_loop_sig_hash: Rauschen ändert Hash nicht" {
  source "$BLS"
  local log1; log1=$(mktemp); local log2; log2=$(mktemp)
  printf 'Error: test failed\n/home/user/src/foo.ts\n[500ms]\n' > "$log1"
  printf 'Error: test failed\n/home/other/src/bar.ts\n[200ms]\n' > "$log2"
  local h1; h1=$(build_loop_sig_hash "$log1")
  local h2; h2=$(build_loop_sig_hash "$log2")
  rm -f "$log1" "$log2"
  [ "$h1" = "$h2" ]
}

@test "FA-SF-37-retry: build_loop_sig_hash: identischer Log → gleicher Hash" {
  source "$BLS"
  local log; log=$(mktemp)
  printf 'Error: test failed\n' > "$log"
  local h1; h1=$(build_loop_sig_hash "$log")
  local h2; h2=$(build_loop_sig_hash "$log")
  rm -f "$log"
  [ "$h1" = "$h2" ]
}

@test "FA-SF-37-retry: build_loop_decide: allowed classify → continue" {
  source "$BLS"
  run build_loop_decide "0" "3" "" "test" "" "abc"
  echo "$output" | head -1 | grep -qE '^continue$'
}

@test "FA-SF-37-retry: build_loop_decide: disallowed classify → escalate-gate" {
  source "$BLS"
  run build_loop_decide "0" "3" "" "secret" "" "abc"
  echo "$output" | head -1 | grep -qE '^abort:escalate-gate$'
}

@test "FA-SF-37-retry: build_loop_decide: max iterations → abort" {
  source "$BLS"
  run build_loop_decide "3" "3" "" "test" "" "abc"
  echo "$output" | head -1 | grep -qE '^abort:max-iterations$'
}

@test "FA-SF-37-retry: build_loop_decide: no-progress → abort" {
  source "$BLS"
  run build_loop_decide "1" "3" "deadbeef" "test" "" "deadbeef"
  echo "$output" | head -1 | grep -qE '^abort:no-progress$'
}

@test "FA-SF-37-retry: build_loop_decide: escalate paths → escalate-gate" {
  source "$BLS"
  run build_loop_decide "0" "3" "" "test" "k3d/foo.yaml" "abc"
  echo "$output" | head -1 | grep -qE '^abort:escalate-gate$'
}

@test "FA-SF-37-retry: build_loop.cjs lints clean (node --check)" {
  run node --check "$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.cjs"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: build-loop unit tests pass" {
  run node "$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.test.cjs"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: pipeline.js hat BL.require" {
  run grep -qE "require.*build-loop" "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: pipeline.js nutzt runTaskVerifyLoop" {
  run grep -qE "runTaskVerifyLoop" "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: build-loop.cjs exportiert runTaskVerifyLoop" {
  run node -e "const m = require('$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.cjs'); console.log(typeof m.runTaskVerifyLoop)"
  [ "$status" -eq 0 ]
  [[ "$output" == "function" ]]
}
