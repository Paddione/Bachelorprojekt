#!/usr/bin/env bats
# tests/spec/dev-flow-execute.bats
# SSOT: openspec/specs/dev-flow-execute.md
#
# Covers: dev-flow-execute SKILL.md content — worktree guards, branch guard, merge command.
# Migrated from tests/spec/superpowers-executing-plans.bats (T002302).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  DEV_FLOW_EXEC="$REPO/.claude/skills/dev-flow-execute/SKILL.md"
}

@test "dev-flow-execute SKILL.md exists" {
  [ -f "$DEV_FLOW_EXEC" ]
}

@test "dev-flow-execute contains worktree isolation check" {
  run grep -q "Worktree-Isolation" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}

@test "dev-flow-execute contains branch guard" {
  run grep -q "Branch-Guard" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}

@test "dev-flow-execute contains gh pr merge command" {
  run grep -q "gh pr merge" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}

@test "dev-flow-execute contains squash merge" {
  run grep -q "squash" "$DEV_FLOW_EXEC"
  [ "$status" -eq 0 ]
}

@test "no superpowers-* skill directories tracked" {
  RUN_COUNT=$(git -C "$REPO" ls-files -- .claude/skills | grep -c 'superpowers-' || true)
  [ "$RUN_COUNT" -eq 0 ]
}

@test "T002339: git-workflow-procedures requires a CI watch loop to treat empty gh response as retry, not state change" {
  REF="$REPO/.claude/skills/references/git-workflow-procedures.md"
  [ -f "$REF" ]
  run grep -q "empty.*gh.*response\|Transportfehler\|continue;.*}" "$REF"
  [ "$status" -eq 0 ]
}
