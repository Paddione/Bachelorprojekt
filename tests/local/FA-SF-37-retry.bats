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
