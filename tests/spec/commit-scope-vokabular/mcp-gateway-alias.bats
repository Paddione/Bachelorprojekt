#!/usr/bin/env bats
# tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats
# SSOT: openspec/specs/ci-cd.md
#
# Requirement: "Konsolidierte Scope-Namen nennen ihr Ziel" — scopes that were
# consolidated into a named scope MUST report the target scope name.
#
# Requirement: "Ablehnung eines unbekannten Scopes verweist auf den
# scope-blinden PR-Titel-Check" — the reject message MUST mention that the
# CI PR-title check does not validate scope.
#
# Regression: T002814 — fix(mcp-gateway): passed PR-title check but failed
# local commit-msg hook because the two validators used different scope vocab.

SCRIPT="${BATS_TEST_DIRNAME}/../../../scripts/validate-commit-msg.sh"

setup() {
  TMP_MSG="$(mktemp)"
}

teardown() {
  rm -f "$TMP_MSG"
}

@test "positive anchor: fix(ops) is accepted" {
  echo "fix(ops): correct commit-lint scope" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "rejects fix(mcp-gateway) and reports mcp as target scope" {
  echo "fix(mcp-gateway): agy headless mcp tool permissions" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"mcp"* ]]
}

@test "rejects chore(tickets) and reports factory as target scope" {
  echo "chore(tickets): register mcp tool params" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"factory"* ]]
}

@test "rejects unknown scope and hints at PR-title check not validating scope" {
  echo "fix(totally-not-a-real-scope): x" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  # Must mention that the CI PR-title check does not validate scope
  [[ "$output" =~ [Pp][Rr][-]?[Tt]it(el|le) ]]
}
