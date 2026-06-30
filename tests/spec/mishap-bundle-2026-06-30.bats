#!/usr/bin/env bats
# tests/spec/mishap-bundle-2026-06-30.bats
# T001331 — Mishap-Bundle: git-crypt smudge, dev-flow-execute PR, status drift

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Mishap 1: git-crypt stale smudge markers in worktrees ──────────────────

@test "T001331: worktree-create.sh references git-crypt-guard.sh for stale-smudge detection" {
  [ -f "$REPO/scripts/worktree-create.sh" ]
  run grep -F 'git-crypt-guard.sh' "$REPO/scripts/worktree-create.sh"
  [ "$status" -eq 0 ]
}

@test "T001331: worktree-create.sh re-copies git-crypt key on stale detection (cp after checkout)" {
  [ -f "$REPO/scripts/worktree-create.sh" ]
  run grep -n 'cp.*git-crypt/keys/default' "$REPO/scripts/worktree-create.sh"
  [ "$status" -eq 0 ]
  local cp_lines
  cp_lines="$(grep -c 'cp.*git-crypt/keys/default' "$REPO/scripts/worktree-create.sh")"
  # At least one cp for the normal unlock path (line ~88) + one for stale recovery
  [ "$cp_lines" -ge 2 ]
}

# ── Mishap 2: dev-flow-execute missing PR creation ─────────────────────────

@test "T001331: dev-flow-execute SKILL.md has post-PR-creation verification (pr_created)" {
  [ -f "$REPO/.claude/skills/dev-flow-execute/SKILL.md" ]
  run grep -F 'pr_created:' "$REPO/.claude/skills/dev-flow-execute/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── Mishap 3: T000099 status drift — validation script exists ──────────────

@test "T001331: ticket-status-validate.sh exists and checks status/timestamp consistency" {
  [ -f "$REPO/scripts/ticket-status-validate.sh" ]
  run grep -E 'in_progress.*done_at|done_at IS NOT NULL.*in_progress|done.*done_at IS NULL' "$REPO/scripts/ticket-status-validate.sh"
  [ "$status" -eq 0 ]
}
