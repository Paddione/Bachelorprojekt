#!/usr/bin/env bats
# tests/spec/pipeline-divergence-T002393.bats
# RED/GREEN: pipeline.mjs muss dieselben Blöcke haben wie pipeline.js

setup() {
  load 'test_helper.bash'
  PJS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.js"
  PMS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.mjs"
}

@test "T002393: pipeline.mjs hat setupWorktree-Funktion" {
  grep -q 'async function setupWorktree' "$PMS"
}

@test "T002393: pipeline.mjs hat guard-overwrite (T002286)" {
  grep -q 'guard-overwrite' "$PMS"
}

@test "T002393: pipeline.mjs hat read-partials (T002074)" {
  grep -q 'read-partials' "$PMS"
}

@test "T002393: pipeline.mjs hat partial-done phase-event (T002074)" {
  grep -q 'partial-done' "$PMS"
}

@test "T002393: pipeline.mjs hat branch-in-use deferral" {
  grep -q 'branch-in-use' "$PMS"
}

@test "T002393: pipeline.mjs hat PR-Gate (pr-ready)" {
  grep -q 'pr-ready' "$PMS"
}
