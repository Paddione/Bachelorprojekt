#!/usr/bin/env bats
# tests/spec/t001356-git02-conventional-commit.bats
# SSOT: openspec/changes/t001356-git02-conventional-commit/specs/t001356-git02-conventional-commit.md
#
# G-GIT02: Non-conventional commit regression — commits with "Betreff" in main.
# Verifies scripts/validate-commit-msg.sh (the shared validator called by both
# .githooks/pre-push and the CI commit-lint job) rejects non-conventional
# commit subjects and accepts conventional ones.

SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/validate-commit-msg.sh"

setup() {
  TMP_MSG="$(mktemp)"
}

teardown() {
  rm -f "$TMP_MSG"
}

@test "validate-commit-msg.sh exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "rejects the exact regression subject (literal 'Betreff' placeholder)" {
  echo "Betreff in main" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not a Conventional Commit header"* ]]
}

@test "rejects a non-conventional German subject" {
  echo "Betreff: Test" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
}

@test "accepts a valid conventional-commit subject" {
  echo "fix(ops): correct commit-lint scope [T001356]" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "accepts a valid conventional-commit subject without scope" {
  echo "chore: tidy up temp files" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "rejects an unknown type" {
  echo "wip: half-finished thing" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown type"* ]]
}

@test "rejects an unknown scope" {
  echo "fix(totally-not-a-real-scope): x" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown scope"* ]]
}

@test "exempts merge commit subjects" {
  echo "Merge pull request #1234 from foo/bar" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "validates a commit range and reports pass/fail counts" {
  run "$SCRIPT" range "HEAD~1..HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}

@test "usage error on missing arguments" {
  run "$SCRIPT"
  [ "$status" -eq 2 ]
}

@test ".githooks/pre-push invokes validate-commit-msg.sh" {
  grep -q 'validate-commit-msg.sh' "${BATS_TEST_DIRNAME}/../../.githooks/pre-push"
}

@test "CI commit-lint job invokes validate-commit-msg.sh" {
  grep -q 'validate-commit-msg.sh' "${BATS_TEST_DIRNAME}/../../.github/workflows/ci.yml"
}
