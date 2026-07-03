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
# These tests originally targeted the guards inline in dev-flow-chore/SKILL.md
# and ticket-ops/SKILL.md. PR #2493 (T001441, "modularize skills — dedupe into
# SSOT references") intentionally hoisted both guards into shared SSOT
# reference files without touching this bats file:
#   - git-crypt-Staging-/Secret-in-index-Guard -> .claude/skills/git-workflow/SKILL.md
#   - ticket-ops Phase 4 Step 4.4 (GitHub Issue Intake + title-dedupe guard,
#     incl. the T001147 canonical reference) -> the shared
#     "## 4. GitHub-Issue-Intake" section in
#     .claude/skills/references/repo-hygiene-ops.md
# The assertions below were repointed (T001210 follow-up, T001526) at the
# SSOT files so they keep guarding against the guard silently disappearing,
# instead of against the (now-stale) assumption that it lives inline.

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  DEV_FLOW_CHORE_SKILL="$REPO/.claude/skills/dev-flow-chore/SKILL.md"
  TICKET_OPS_SKILL="$REPO/.claude/skills/ticket-ops/SKILL.md"
  GIT_WORKFLOW_SKILL="$REPO/.claude/skills/git-workflow/SKILL.md"
  REPO_HYGIENE_OPS="$REPO/.claude/skills/references/repo-hygiene-ops.md"
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
  [ -f "$GIT_WORKFLOW_SKILL" ]
  # T001441 hoisted the actual guard implementation into git-workflow/SKILL.md
  # (the declared SSOT). dev-flow-chore Step 4 must still point at it by name
  # ("git-crypt-Staging-Guard [T001210]") so the guard isn't silently
  # dropped from the chore commit/push flow, and the SSOT file must contain
  # the real pattern match (canonical from T001199 / PR #2135).
  run grep -nE 'git-crypt-Staging-Guard \[T001210\]' "$DEV_FLOW_CHORE_SKILL"
  [ "$status" -eq 0 ]
  run grep -nE 'environments/\.secrets' "$GIT_WORKFLOW_SKILL"
  [ "$status" -eq 0 ]
}

@test "T001210: dev-flow-chore secret-in-index guard is positioned in Step 4 (commit/push section)" {
  [ -f "$DEV_FLOW_CHORE_SKILL" ]
  # The SSOT reference to the guard must live in the commit/push section,
  # not in a later deploy section. Find the line of the "## Schritt 4"
  # header, the line of "## Schritt 5", and the line of the guard
  # reference; the reference must be between those two lines.
  local step4 schritt5 guard
  step4="$(grep -n '^## Schritt 4' "$DEV_FLOW_CHORE_SKILL" | head -1 | cut -d: -f1)"
  schritt5="$(grep -n '^## Schritt 5' "$DEV_FLOW_CHORE_SKILL" | head -1 | cut -d: -f1)"
  guard="$(grep -nE 'git-crypt-Staging-Guard \[T001210\]' "$DEV_FLOW_CHORE_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$step4" ]
  [ -n "$schritt5" ]
  [ -n "$guard" ]
  [ "$guard" -gt "$step4" ]
  [ "$guard" -lt "$schritt5" ]
}

# ── Mishap 2: ticket-ops must dedupe intake by title (T001147/T001148 family) ──────

@test "T001210: ticket-ops Phase 4 Step 4.4 (GitHub Issue Intake) has a title-dedupe guard" {
  [ -f "$TICKET_OPS_SKILL" ]
  [ -f "$REPO_HYGIENE_OPS" ]
  # T001441 hoisted Phase 4 (incl. Step 4.4 GitHub Issue Intake) out of
  # ticket-ops/SKILL.md into the shared repo-hygiene-ops.md SSOT reference,
  # renumbered "### Step 4.4" -> "## 4.". ticket-ops/SKILL.md must still
  # reference the dedupe guard by name so it isn't silently dropped, and
  # the SSOT file must contain the actual guard step (any of `dedup`,
  # `deduplicate`, `duplicate ticket`, or `same title`, as a word/phrase
  # -- not a substring of unrelated prose like `execution`) after the
  # "## 4." GitHub-Issue-Intake header.
  run grep -nEi 'Dedupe-Guard' "$TICKET_OPS_SKILL"
  [ "$status" -eq 0 ]
  local step4 keyword
  step4="$(grep -nE '^##[[:space:]]+4\.[[:space:]]' "$REPO_HYGIENE_OPS" | head -1 | cut -d: -f1)"
  [ -n "$step4" ]
  keyword="$(grep -nEi 'dedup|deduplicate|duplicate ticket|same title' "$REPO_HYGIENE_OPS" | head -1 | cut -d: -f1)"
  [ -n "$keyword" ]
  [ "$keyword" -gt "$step4" ]
}

@test "T001210: ticket-ops Step 4.4 dedupe guard references the canonical T001147 (regression marker)" {
  [ -f "$REPO_HYGIENE_OPS" ]
  # The dedupe guard (now in repo-hygiene-ops.md, see above) cross-
  # references the canonical reference ticket (T001147, the shipped "E2E
  # notification test — Playwright FA-bug-notify" ticket) so the dedupe
  # lookup is anchored to a real example. This is a regression marker: a
  # future re-introduction of duplicate-ticket creation will be caught by
  # the canonical reference being cited.
  local step4 ref
  step4="$(grep -nE '^##[[:space:]]+4\.[[:space:]]' "$REPO_HYGIENE_OPS" | head -1 | cut -d: -f1)"
  [ -n "$step4" ]
  # Look for T001147 (or T001148, the prior mishap bundle) in the file.
  ref="$(grep -nE 'T001147|T001148' "$REPO_HYGIENE_OPS" | head -1 | cut -d: -f1)"
  [ -n "$ref" ]
  [ "$ref" -gt "$step4" ]
}
