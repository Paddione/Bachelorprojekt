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
  # T001812: factory-prep (which sources guards.sh) now runs in wakeup.sh, once
  # per while-loop tick, BEFORE the Workflow call — not inside dispatcher.js
  # anymore (see FA-SF-30: dispatcher reads prep from a file, below). "Fresh per
  # tick" holds because wakeup.sh recomputes prep_file on every loop iteration.
  WAKEUP="scripts/factory/wakeup.sh"
  run grep -q "scripts/factory/guards.sh\|factory-prep" "$WAKEUP"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: dispatcher reads prep from a file, not via child_process (T001812)" {
  # T001810 ran factory-prep via child_process.execFileSync INSIDE the Workflow
  # call (up to 300s worst case), which was slow enough to flip the call into the
  # harness's async "launched in background" mode — a one-shot `claude -p`
  # session never survives to see that notification (orphaned runs observed,
  # no transcript dir ever written). T001812 moved factory-prep back to
  # wakeup.sh (synchronous bash) and hands the result to dispatcher.js as a file
  # path, keeping the Workflow call itself fast/synchronous.
  run grep -q "args.prep_file\|A.prep_file" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "readFileSync" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: PREP gate is fail-closed (drops the brand from launch on guard trip / read error)" {
  # T001812: fail-closed via JS exception on missing/invalid prep_file — same
  # early-return-with-no-launches contract as before, different trigger.
  run grep -Eq "prep_file missing|JSON.parse\(raw\)" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: captures the parallel() launch result (not discarded)" {
  run grep -Eq "const +results +=.*parallel\(|= await parallel\(" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: post-launch escalation loads PushNotification via ToolSearch and notifies on error/blocked" {
  run grep -q "ToolSearch select:PushNotification" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "\.error|status === 'blocked'|status: *'blocked'|blocked" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: agent() opts do NOT pin a model (T000543/#1466 — inherit session model via run-dispatcher.sh)" {
  # T000519/#1430 fixed the DeepSeek 400 by unsetting CLAUDE_CODE_EFFORT_LEVEL in wakeup.sh
  # and run-dispatcher.sh, so the ambient config no longer carries reasoning_effort.
  # T000543/#1466 then intentionally removed the model: pins so the dispatcher inherits the
  # session model from the invoker (DeepSeek or Anthropic), keeping dispatch flexible.
  # Guard: verify agent labels are present but none carry a hard model: pin.
  # T001810: prep is now deterministic (child_process), only escalate + metrics remain.
  labels=$(grep -cE "label: '(escalate|metrics)'" "$SCRIPT")
  [ "$labels" -eq 2 ]
  pinned=$(grep -E "label: '(escalate|metrics)'" "$SCRIPT" | grep "model:" | wc -l)
  [ "$pinned" -eq 0 ]
}
