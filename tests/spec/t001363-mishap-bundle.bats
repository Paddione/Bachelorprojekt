#!/usr/bin/env bats
# tests/spec/t001363-mishap-bundle.bats
# T001363 — Mishap-Bundle: git-worktree reap, dev-flow-execute worktree-check, git-crypt-guard

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Mishap 1: git-worktree — already fixed (regression guard) ─────────────

@test "T001363: agent-lock.sh reap() prunes orphaned git worktree admin entries" {
  [ -f "$REPO/scripts/agent-lock.sh" ]
  run grep -F 'git worktree prune' "$REPO/scripts/agent-lock.sh"
  [ "$status" -eq 0 ]
}

# ── Mishap 2: dev-flow-execute — THE FIX ───────────────────────────────────

@test "T001363: dev-flow-execute SKILL.md Schritt 0 creates a worktree via worktree-create.sh when not already isolated" {
  [ -f "$REPO/.claude/skills/dev-flow-execute/SKILL.md" ]
  run grep -F 'worktree-create.sh' "$REPO/.claude/skills/dev-flow-execute/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── Mishap 3: git-crypt — already fixed (regression guard) ────────────────

@test "T001363: git-crypt-guard.sh has a check-tracked function/case" {
  [ -f "$REPO/scripts/git-crypt-guard.sh" ]
  run grep -F 'check-tracked' "$REPO/scripts/git-crypt-guard.sh"
  [ "$status" -eq 0 ]
}
