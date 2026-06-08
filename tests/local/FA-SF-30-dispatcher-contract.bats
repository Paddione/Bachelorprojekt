#!/usr/bin/env bats
# FA-SF-30: structural contract for the dispatcher Workflow script (offline).
SCRIPT="scripts/factory/dispatcher.js"
setup() { load 'test_helper.bash'; }

@test "FA-SF-30: dispatcher.js exists and is syntactically valid JS" {
  [ -f "$SCRIPT" ]
  run node --check "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-30: exports meta with the three expected phases" {
  run grep -Eq "export const meta" "$SCRIPT"; [ "$status" -eq 0 ]
  for p in Prep Launch Metrics; do
    run grep -q "phase('$p')" "$SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-30: wires the primitives (watchdog, schedule, metrics, ticket.sh get)" {
  for needle in "watchdog.sh" "schedule.sh" "metrics.sh" "ticket.sh get"; do
    run grep -q "$needle" "$SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-30: launches pipeline.js via workflow scriptPath" {
  run grep -q "scripts/factory/pipeline.js" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "workflow\(" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: resume-safe (uses args.timestamp, no Date.now()/Math.random())" {
  run grep -q "args.timestamp\|A.timestamp" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "Date\.now\(\)|Math\.random\(\)" "$SCRIPT"; [ "$status" -ne 0 ]
}

@test "FA-SF-30: schedules across BOTH brands" {
  run grep -q "mentolder" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "korczewski" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: PREP gate reads hard guards fresh per tick via guards.sh" {
  run grep -q "scripts/factory/guards.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "guard_killswitch_on" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "guard_daily_cap_reached" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: PREP gate is fail-closed (drops the brand from launch on guard trip / read error)" {
  run grep -Eq "fail-closed|fail closed" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: captures the parallel() launch result (not discarded)" {
  run grep -Eq "const +results +=.*parallel\(|= await parallel\(" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: post-launch escalation loads PushNotification via ToolSearch and notifies on error/blocked" {
  run grep -q "ToolSearch select:PushNotification" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "\.error|status === 'blocked'|status: *'blocked'|blocked" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: every agent() opts pins an explicit model (DeepSeek reasoning_effort 400 guard — T000528)" {
  # The dispatcher runs under DeepSeek-backed autopilot; an agent() call that inherits the
  # ambient model config trips the 'thinking cannot be disabled when reasoning_effort is set'
  # 400 and fails PREP. Each agent() opts (prep/escalate/metrics) must pin model: explicitly.
  # Sibling guard to the pipeline.js fix (T000519/#1430).
  labels=$(grep -cE "label: '(prep|escalate|metrics)'" "$SCRIPT")
  [ "$labels" -eq 3 ]
  pinned=$(grep -E "label: '(prep|escalate|metrics)'" "$SCRIPT" | grep -c "model:")
  [ "$pinned" -eq 3 ]
}
