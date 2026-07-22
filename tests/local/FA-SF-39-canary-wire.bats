#!/usr/bin/env bats
# FA-SF-39-canary-wire — Deploy-phase canary wiring in pipeline.js
PJS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.js"

setup() { load 'test_helper.bash'; }

@test "FA-SF-39-wire: pipeline.js lints clean" {
  run node --check "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: Deploy invokes observe_prod per brand" {
  # observe_prod lives in buildDeployPrompt (pipeline-partials.cjs) since T002074.
  run grep -qE 'observe_prod' "$PJS" "$BATS_TEST_DIRNAME/../../scripts/factory/pipeline-partials.cjs"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: canary-red turns feature flag OFF via ticket.sh" {
  run grep -qE 'feature-flag set .*--enabled false' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: canary-red fires PushNotification" {
  run grep -qE 'canary|Canary' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'PushNotification' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: both brands observed (mentolder + korczewski)" {
  run grep -qE 'mentolder' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'korczewski' "$PJS"
  [ "$status" -eq 0 ]
}
