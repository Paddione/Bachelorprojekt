#!/usr/bin/env bats
# tests/spec/dev-flow-chore-ticket-ops-mishaps.bats
# T001210 — Mishap-Bundle: dev-flow-chore (git-crypt staging) + ticket-ops (duplicate intake)
#
# Convention: one .bats file per OpenSpec SSOT spec / fix bundle. Simple
# [ ... ] assertions, no bats-support dependency required. The
# `load 'test_helper'` is harmless if the helper is absent (BATS `load`
# silently no-ops on a missing file at this layer — both existing
# tests/spec/*.bats files use the same pattern).
#
# These tests are RED on the current branch (HEAD 2cc010f5): the
# fixes described in openspec/changes/dev-flow-chore-ticket-ops-mishaps/
# have not been applied yet. They turn GREEN after the corresponding
# edits in .claude/skills/dev-flow-chore/SKILL.md (Step 4) and
# .claude/skills/ticket-ops/SKILL.md (Phase 4 Step 4.4 + Phase 1 Step 1.4)
# land. See docs/superpowers/specs/2026-06-27-t001210-dev-flow-chore-ticket-ops-mishaps-design.md
# for the design note and the OpenSpec plan for the implementation tasks.

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  DEV_FLOW_CHORE_SKILL="$REPO/.claude/skills/dev-flow-chore/SKILL.md"
  TICKET_OPS_SKILL="$REPO/.claude/skills/ticket-ops/SKILL.md"
}

# ── Mishap 1: dev-flow-chore must not use `git add -A` and must guard the index ────

@test "T001210: dev-flow-chore Step 4 does not use a bare 'git add -A' (git-crypt foot-gun)" {
  [ -f "$DEV_FLOW_CHORE_SKILL" ]
  # The fix replaces `git add -A` with explicit path staging of only the
  # files the chore actually changed (or an explicit
  # -- ':!environments/.secrets/*' exclude). A bare `git add -A` would
  # promote ~21 git-crypt smudge artifacts from environments/.secrets/**
  # into the index on every chore commit.
  run grep -nE '^[[:space:]]*git add -A[[:space:]]*$' "$DEV_FLOW_CHORE_SKILL"
  [ "$status" -ne 0 ]
}

@test "T001210: dev-flow-chore Step 4 has a secret-in-index guard for environments/.secrets/**" {
  [ -f "$DEV_FLOW_CHORE_SKILL" ]
  # The fix adds a hard pre-commit guard that aborts with FATAL if the
  # index contains any path under environments/.secrets/. The grep below
  # matches the canonical pattern from T001199 / PR #2135.
  run grep -nE 'environments/\.secrets' "$DEV_FLOW_CHORE_SKILL"
  [ "$status" -eq 0 ]
}

@test "T001210: dev-flow-chore secret-in-index guard is positioned in Step 4 (commit/push section)" {
  [ -f "$DEV_FLOW_CHORE_SKILL" ]
  # The guard must live in the commit/push section, not in a later deploy
  # section. Find the line of the "## Schritt 4" header, the line of
  # "## Schritt 5", and the line of the guard; the guard must be between
  # those two lines.
  local step4 schritt5 guard
  step4="$(grep -n '^## Schritt 4' "$DEV_FLOW_CHORE_SKILL" | head -1 | cut -d: -f1)"
  schritt5="$(grep -n '^## Schritt 5' "$DEV_FLOW_CHORE_SKILL" | head -1 | cut -d: -f1)"
  guard="$(grep -nE 'environments/\.secrets' "$DEV_FLOW_CHORE_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$step4" ]
  [ -n "$schritt5" ]
  [ -n "$guard" ]
  [ "$guard" -gt "$step4" ]
  [ "$guard" -lt "$schritt5" ]
}

# ── Mishap 2: ticket-ops must dedupe intake by title (T001147/T001148 family) ──────

@test "T001210: ticket-ops Phase 4 Step 4.4 (GitHub Issue Intake) has a title-dedupe guard" {
  [ -f "$TICKET_OPS_SKILL" ]
  # The fix adds a "check for an existing open ticket with the same title
  # (or canonical reference) before INSERT" step in Phase 4 Step 4.4
  # (GitHub Issue Intake). The keyword set is the contract: any of
  # `dedup`, `deduplicate`, `duplicate ticket`, or `same title` (each
  # as a word/phrase, not a substring of unrelated prose like
  # `execution`). We grep the file for the keyword and assert it lands
  # AFTER the Step 4.4 header (line ~302).
  local step44 keyword
  step44="$(grep -nE '^###[[:space:]]+Step 4\.4' "$TICKET_OPS_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$step44" ]
  # Anchor on a strict phrase pattern to avoid false positives from
  # the existing `duplicate_of` schema enum and `execution wave` prose.
  keyword="$(grep -nEi 'dedup|deduplicate|duplicate ticket|same title' "$TICKET_OPS_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$keyword" ]
  [ "$keyword" -gt "$step44" ]
}

@test "T001210: ticket-ops Step 4.4 dedupe guard references the canonical T001147 (regression marker)" {
  [ -f "$TICKET_OPS_SKILL" ]
  # The fix cross-references the canonical reference ticket (T001147, the
  # shipped "E2E notification test — Playwright FA-bug-notify" ticket) so
  # the dedupe lookup is anchored to a real example. This is a regression
  # marker: a future re-introduction of duplicate-ticket creation will
  # be caught by the canonical reference being cited.
  local step44 ref
  step44="$(grep -nE '^###[[:space:]]+Step 4\.4' "$TICKET_OPS_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$step44" ]
  # Look for T001147 (or T001148, the prior mishap bundle) in the skill.
  ref="$(grep -nE 'T001147|T001148' "$TICKET_OPS_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$ref" ]
  [ "$ref" -gt "$step44" ]
}
