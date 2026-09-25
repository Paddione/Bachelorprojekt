#!/usr/bin/env bats
# Tests for scripts/brain-ingest.sh --group plumbing (T900402). Guard-only:
# every case fails before any chunking/LLM work, so no model is needed.

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-ingest.sh"

setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/brain/wiki"
  git init -q "$TESTDIR/brain" 2>/dev/null
  printf '{}\n' > "$TESTDIR/state.json"
}

teardown() {
  rm -rf "$TESTDIR"
}

@test "ingest rejects unknown group before doing any work" {
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --state "$TESTDIR/state.json" \
    --group bogus
  [ "$status" -ne 0 ]
  [[ "$output" == *"unbekannte Gruppe"* ]]
}

@test "ingest rejects --group combined with --from-scratch" {
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --state "$TESTDIR/state.json" \
    --group runbooks --from-scratch --dry-run
  [ "$status" -eq 2 ]
  [[ "$output" == *"cannot be combined with --group"* ]]
}
