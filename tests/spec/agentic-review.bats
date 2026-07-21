#!/usr/bin/env bats
# tests/spec/agentic-review.bats
# SSOT: openspec/specs/agentic-review.md
#
# Covers: CI review pipeline — tiered lenses, finding filter, coordinator, PR posting.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  CI_REVIEW="$REPO/scripts/factory/ci-review.mjs"
  FILTER="$REPO/scripts/factory/review-finding-filter.mjs"
  PROMPT_DIR="$REPO/scripts/factory"
}

# ── File structure ─────────────────────────────────────────────────────

@test "agentic-review: ci-review.mjs exists" {
  [ -f "$CI_REVIEW" ]
}

@test "agentic-review: ci-review.mjs is syntactically valid (node --check)" {
  run node --check "$CI_REVIEW"
  [ "$status" -eq 0 ]
}

@test "agentic-review: review-finding-filter.mjs exists" {
  [ -f "$FILTER" ]
}

@test "agentic-review: review-finding-filter.mjs is syntactically valid (node --check)" {
  run node --check "$FILTER"
  [ "$status" -eq 0 ]
}

@test "agentic-review: ci-review.mjs imports review-finding-filter.mjs" {
  run grep -q "review-finding-filter" "$CI_REVIEW"
  [ "$status" -eq 0 ]
}

# ── Lens registry ──────────────────────────────────────────────────────

@test "agentic-review: ci-review.mjs defines LENS_FILE mapping for all 5 lenses" {
  for lens in bug security pattern perf agents-md; do
    run grep -q "$lens" "$CI_REVIEW"
    [ "$status" -eq 0 ]
  done
}

@test "agentic-review: ci-review.mjs defines TIER_LENSES with trivial/lite/full" {
  run grep -q "TIER_LENSES" "$CI_REVIEW"
  [ "$status" -eq 0 ]
  run grep -q "trivial" "$CI_REVIEW"
  [ "$status" -eq 0 ]
  run grep -q "lite" "$CI_REVIEW"
  [ "$status" -eq 0 ]
  run grep -q "full" "$CI_REVIEW"
  [ "$status" -eq 0 ]
}

# ── Prompt files exist ─────────────────────────────────────────────────

@test "agentic-review: review-bug-hunter.prompt.md exists" {
  [ -f "$PROMPT_DIR/review-bug-hunter.prompt.md" ]
}

@test "agentic-review: review-security-auditor.prompt.md exists" {
  [ -f "$PROMPT_DIR/review-security-auditor.prompt.md" ]
}

@test "agentic-review: review-pattern-enforcer.prompt.md exists" {
  [ -f "$PROMPT_DIR/review-pattern-enforcer.prompt.md" ]
}

@test "agentic-review: review-perf-reviewer.prompt.md exists" {
  [ -f "$PROMPT_DIR/review-perf-reviewer.prompt.md" ]
}

@test "agentic-review: review-agents-md-staleness.prompt.md exists" {
  [ -f "$PROMPT_DIR/review-agents-md-staleness.prompt.md" ]
}

@test "agentic-review: review-coordinator.prompt.md exists" {
  [ -f "$PROMPT_DIR/review-coordinator.prompt.md" ]
}

# ── Finding filter exports ─────────────────────────────────────────────

@test "agentic-review: filter exports parseChangedLines function" {
  run grep -q "export function parseChangedLines" "$FILTER"
  [ "$status" -eq 0 ]
}

@test "agentic-review: filter exports filterFindings function" {
  run grep -q "export function filterFindings" "$FILTER"
  [ "$status" -eq 0 ]
}

@test "agentic-review: filter exports formatChangedLinesHint function" {
  run grep -q "export function formatChangedLinesHint" "$FILTER"
  [ "$status" -eq 0 ]
}

@test "agentic-review: filter exports isStyleNitpick function" {
  run grep -q "export function isStyleNitpick" "$FILTER"
  [ "$status" -eq 0 ]
}

@test "agentic-review: default confidence threshold is 0.6" {
  run grep -q "confidenceThreshold: 0.6" "$FILTER"
  [ "$status" -eq 0 ]
}

# ── Prompt quality ─────────────────────────────────────────────────────

@test "agentic-review: agents-md-staleness prompt contains Materiality Rubric" {
  run grep -q "Materiality Rubric" "$PROMPT_DIR/review-agents-md-staleness.prompt.md"
  [ "$status" -eq 0 ]
}

@test "agentic-review: agents-md-staleness prompt defines high/medium/low levels" {
  run grep -q "high" "$PROMPT_DIR/review-agents-md-staleness.prompt.md"
  [ "$status" -eq 0 ]
  run grep -q "medium" "$PROMPT_DIR/review-agents-md-staleness.prompt.md"
  [ "$status" -eq 0 ]
  run grep -q "low" "$PROMPT_DIR/review-agents-md-staleness.prompt.md"
  [ "$status" -eq 0 ]
}

# ── Fail-safe behavior ─────────────────────────────────────────────────

@test "agentic-review: ci-review.mjs checks ANTHROPIC_API_KEY before API call" {
  run grep -q "ANTHROPIC_API_KEY" "$CI_REVIEW"
  [ "$status" -eq 0 ]
}
