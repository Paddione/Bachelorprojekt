#!/usr/bin/env bats
# Tests: batch-workflow-gen.sh erzeugt valides Workflow-Script

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/batch-workflow-gen.sh"
  OUTFILE="/tmp/test-batch-workflow-$$.mjs"
}

teardown() { rm -f "$OUTFILE"; }

@test "FA-BATCH-01: generiertes Script besteht node --check" {
  bash "$SCRIPT" "$OUTFILE"
  node --check "$OUTFILE"
}

@test "Script enthaelt export const meta" {
  bash "$SCRIPT" "$OUTFILE"
  grep -q "export const meta" "$OUTFILE"
}

@test "Script enthaelt alle drei Phasen" {
  bash "$SCRIPT" "$OUTFILE"
  grep -q "Isolated" "$OUTFILE"
  grep -q "Shared"   "$OUTFILE"
  grep -q "Stage"    "$OUTFILE"
}

@test "Script referenziert args.tickets" {
  bash "$SCRIPT" "$OUTFILE"
  grep -q "args\.tickets" "$OUTFILE"
}
