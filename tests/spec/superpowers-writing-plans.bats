#!/usr/bin/env bats
# tests/spec/superpowers-writing-plans.bats
# SSOT: openspec/specs/superpowers-writing-plans.md
#
# Covers: Plan-writing redirect — stub → dev-flow-plan, plan-lint rules.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  STUB="$REPO/.claude/skills/superpowers-writing-plans/SKILL.md"
  DEV_FLOW_PLAN="$REPO/.claude/skills/dev-flow-plan/SKILL.md"
}

# ── Stub redirect ──────────────────────────────────────────────────────

@test "superpowers-writing-plans: stub SKILL.md exists" {
  [ -f "$STUB" ]
}

@test "superpowers-writing-plans: stub has name: superpowers:writing-plans" {
  run grep -q "name: superpowers:writing-plans" "$STUB"
  [ "$status" -eq 0 ]
}

@test "superpowers-writing-plans: stub contains [STUB] marker" {
  run grep -q "\[STUB\]" "$STUB"
  [ "$status" -eq 0 ]
}

@test "superpowers-writing-plans: stub redirects to dev-flow-plan for opencode" {
  run grep -q "dev-flow-plan" "$STUB"
  [ "$status" -eq 0 ]
}

# ── Framework mapping table ────────────────────────────────────────────

@test "superpowers-writing-plans: stub contains framework mapping table" {
  run grep -q "Framework" "$STUB"
  [ "$status" -eq 0 ]
  run grep -q "Claude Code" "$STUB"
  [ "$status" -eq 0 ]
  run grep -q "opencode" "$STUB"
  [ "$status" -eq 0 ]
}

# ── Real logic in dev-flow-plan ────────────────────────────────────────

@test "superpowers-writing-plans: dev-flow-plan SKILL.md exists" {
  [ -f "$DEV_FLOW_PLAN" ]
}

@test "superpowers-writing-plans: dev-flow-plan mentions plan-lint rules" {
  run grep -q "plan-lint" "$DEV_FLOW_PLAN"
  [ "$status" -eq 0 ]
}

@test "superpowers-writing-plans: dev-flow-plan references Step 3.7" {
  run grep -q "3.7" "$DEV_FLOW_PLAN"
  [ "$status" -eq 0 ]
}

@test "superpowers-writing-plans: dev-flow-plan mentions frontmatter keys" {
  run grep -q "frontmatter" "$DEV_FLOW_PLAN"
  [ "$status" -eq 0 ]
}
