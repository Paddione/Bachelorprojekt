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
