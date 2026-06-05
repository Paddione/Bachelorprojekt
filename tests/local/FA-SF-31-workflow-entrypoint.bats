#!/usr/bin/env bats
# FA-SF-31: factory Workflow scripts must NOT wrap their body in a fire-and-forget
# IIFE. The harness runs the script body and treats the run as complete when the
# top-level statements finish; a `;(async()=>{…})()` body is never awaited, so no
# agent() runs and the return is lost (verified: IIFE → 0 agents/22ms/undefined,
# top-level await → agents run + return propagates). Guard both runnable scripts.

@test "FA-SF-31: pipeline.js has no fire-and-forget async IIFE wrapper" {
  run grep -Eq '\(async[[:space:]]*\([[:space:]]*\)[[:space:]]*=>' scripts/factory/pipeline.js
  [ "$status" -ne 0 ]
  run grep -Eq '^[[:space:]]*\}\)\(\)[[:space:]]*$' scripts/factory/pipeline.js
  [ "$status" -ne 0 ]
}

@test "FA-SF-31: dispatcher.js has no fire-and-forget async IIFE wrapper" {
  run grep -Eq '\(async[[:space:]]*\([[:space:]]*\)[[:space:]]*=>' scripts/factory/dispatcher.js
  [ "$status" -ne 0 ]
  run grep -Eq '^[[:space:]]*\}\)\(\)[[:space:]]*$' scripts/factory/dispatcher.js
  [ "$status" -ne 0 ]
}

@test "FA-SF-31: both scripts still parse and use top-level await" {
  run node --check scripts/factory/pipeline.js;   [ "$status" -eq 0 ]
  run node --check scripts/factory/dispatcher.js; [ "$status" -eq 0 ]
  run grep -Eq 'await (agent|workflow|parallel|pipeline)\(' scripts/factory/pipeline.js;   [ "$status" -eq 0 ]
  run grep -Eq 'await (agent|workflow|parallel|pipeline)\(' scripts/factory/dispatcher.js; [ "$status" -eq 0 ]
}

@test "FA-SF-31: pipeline.js has a dry-run branch that does NOT merge/deploy" {
  run grep -Eq 'dry_run|FACTORY_DRY_RUN|DRY_RUN' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  # In the dry-run branch the deploy agent must be guarded: assert a DRY_RUN const exists
  run grep -Eq 'const DRY_RUN' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}
