#!/usr/bin/env bats
# tests/spec/superpowers-executing-plans.bats
# SSOT: openspec/specs/superpowers-executing-plans.md
#
# Covers: Plan-execution redirect — stub → dev-flow-execute, worktree guards.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  STUB="$REPO/.claude/skills/superpowers-executing-plans/SKILL.md"
  DEV_FLOW_EXEC="$REPO/.claude/skills/dev-flow-execute/SKILL.md"
}

# ── Stub redirect ──────────────────────────────────────────────────────

@test "superpowers-executing-plans: stub SKILL.md exists" {
  [ -f "$STUB" ]
}

@test "superpowers-executing-plans: stub has name: superpowers:executing-plans" {
  run grep -q "name: superpowers:executing-plans" "$STUB"
  [ "$status" -eq 0 ]
}

@test "superpowers-executing-plans: stub contains [STUB] marker" {
  run grep -q "\[STUB\]" "$STUB"
  [ "$status" -eq 0 ]
}

@test "superpowers-executing-plans: stub redirects to dev-flow-execute for opencode" {
  run grep -q "dev-flow-execute" "$STUB"
  [ "$status" -eq 0 ]
}

# ── Framework mapping table ────────────────────────────────────────────

@test "superpowers-executing-plans: stub contains framework mapping table" {
  run grep -q "Framework" "$STUB"
  [ "$status" -eq 0 ]
  run grep -q "Claude Code" "$STUB"
  [ "$status" -eq 0 ]
  run grep -q "opencode" "$STUB"
  [ "$status" -eq 0 ]
}

# ── Real logic in dev-flow-execute ─────────────────────────────────────

@test "superpowers-executing-plans: dev-flow-execute SKILL.md exists" {
  [ -f "$DEV_FLOW_EXEC" ]
}

@test "superpowers-executing-plans: dev-flow-execute contains worktree isolation check" {
  run grep -q "Worktree-Isolation" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}

@test "superpowers-executing-plans: dev-flow-execute contains branch guard" {
  run grep -q "Branch-Guard" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}

@test "superpowers-executing-plans: dev-flow-execute contains gh pr merge command" {
  run grep -q "gh pr merge" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}

@test "superpowers-executing-plans: dev-flow-execute contains squash merge" {
  run grep -q "squash" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}
