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

# T001364: PR/commit scope SSOT — commitlint.config.cjs must become the only
# scope list; ci.yml and pr-auto-title.yml must derive from it dynamically
# instead of maintaining their own copies that can drift.

@test "scopes: prints the allowed scope list, one per line" {
  run "$SCRIPT" scopes
  # expected: FAIL until the `scopes` mode is implemented
  [ "$status" -eq 0 ]
  [[ "$output" == *$'\n'* || "$(echo "$output" | wc -l)" -gt 1 ]]
  echo "$output" | grep -qx "website"
  echo "$output" | grep -qx "ci"
}

@test "scopes: output matches commitlint.config.cjs scope-enum exactly" {
  run "$SCRIPT" scopes
  [ "$status" -eq 0 ]
  node_scopes=$(node -e "
    const cfg = require('${BATS_TEST_DIRNAME}/../../commitlint.config.cjs');
    console.log(cfg.rules['scope-enum'][2].join('\n'));
  ")
  [ "$output" == "$node_scopes" ]
}

@test "ci.yml commit-lint job loads scopes dynamically instead of a hardcoded list" {
  grep -q 'validate-commit-msg.sh scopes' "${BATS_TEST_DIRNAME}/../../.github/workflows/ci.yml"
}

@test "pr-auto-title.yml checks out the repo before deriving a scope" {
  grep -q 'actions/checkout' "${BATS_TEST_DIRNAME}/../../.github/workflows/pr-auto-title.yml"
}

@test "pr-auto-title.yml validates the derived scope against validate-commit-msg.sh scopes" {
  grep -q 'validate-commit-msg.sh scopes' "${BATS_TEST_DIRNAME}/../../.github/workflows/pr-auto-title.yml"
}

@test "register-scope.sh exists and is executable" {
  [ -x "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" ]
}

@test "register-scope.sh adds a new scope to commitlint.config.cjs" {
  TMP_CFG="$(mktemp)"
  cp "${BATS_TEST_DIRNAME}/../../commitlint.config.cjs" "$TMP_CFG"
  COMMITLINT_CONFIG_OVERRIDE="$TMP_CFG" run "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" "bats-test-scope-xyz" --config "$TMP_CFG"
  [ "$status" -eq 0 ]
  grep -q "bats-test-scope-xyz" "$TMP_CFG"
  rm -f "$TMP_CFG"
}

@test "register-scope.sh rejects an already-registered scope" {
  run "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" "website" --config "${BATS_TEST_DIRNAME}/../../commitlint.config.cjs"
  [ "$status" -ne 0 ]
}

@test "register-scope.sh rejects an invalid scope format" {
  run "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" "Not_Valid!"
  [ "$status" -ne 0 ]
}
