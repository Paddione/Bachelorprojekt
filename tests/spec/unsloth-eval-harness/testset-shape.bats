#!/usr/bin/env bats
# Prüfmodus: Output-Verifikation (Command output/Exit-Code), siehe CLAUDE.md
# T002448-M4.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCORER="$REPO_ROOT/scripts/finetune/eval_scoring.py"
  TESTSET="$REPO_ROOT/scripts/finetune/testsets/agent-actions.jsonl"
  TMPDIR="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "shipped testset has at least 40 cases across all three partitions and full language pairing" {
  run python3 "$SCORER" validate-testset "$TESTSET"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK:"* ]]

  count=$(wc -l < "$TESTSET")
  [ "$count" -ge 40 ]

  for cls in action no_action clarify; do
    grep -c "\"class\": \"$cls\"" "$TESTSET" | grep -qv '^0$'
  done
}

@test "artificially truncated testset fails validation with exit != 0" {
  short="$TMPDIR/short.jsonl"
  head -n 10 "$TESTSET" > "$short"
  run python3 "$SCORER" validate-testset "$short"
  [ "$status" -ne 0 ]
  [[ "$output" == *"needs at least 40"* ]]
}

@test "testset missing a language pair fails validation with exit != 0" {
  broken="$TMPDIR/broken.jsonl"
  grep -v '"language": "de"' "$TESTSET" > "$broken"
  run python3 "$SCORER" validate-testset "$broken"
  [ "$status" -ne 0 ]
  [[ "$output" == *"missing language"* ]]
}
