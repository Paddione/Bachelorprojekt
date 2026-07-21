#!/usr/bin/env bats
# tests/spec/grilling-flow.bats
# SSOT: openspec/specs/grilling-flow.md
#
# Covers: Questionnaire registry, built-in questionnaires, multichoice chips.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  GRILLING="$REPO/website/src/lib/tickets/grilling.ts"
}

# ── Questionnaire registry ────────────────────────────────────────────

@test "grilling.ts module exists" {
  [ -f "$GRILLING" ]
}

@test "grilling.ts exports getQuestionnaire function" {
  run grep -q 'getQuestionnaire' "$GRILLING"
  [ "$status" -eq 0 ]
}

# ── Built-in questionnaires ───────────────────────────────────────────

@test "final-grilling-v1 questionnaire is registered" {
  run grep -q 'final-grilling-v1' "$GRILLING"
  [ "$status" -eq 0 ]
}

@test "coaching-sessions-v1 questionnaire is registered" {
  run grep -q 'coaching-sessions-v1' "$GRILLING"
  [ "$status" -eq 0 ]
}

# ── Multichoice chips ─────────────────────────────────────────────────

@test "grilling.ts supports choices array on questions" {
  run grep -q 'choices' "$GRILLING"
  [ "$status" -eq 0 ]
}

# ── Test file exists ──────────────────────────────────────────────────

@test "grilling.test.ts exists with questionnaire validation" {
  [ -f "$REPO/website/src/lib/tickets/grilling.test.ts" ]
}
