#!/usr/bin/env bats
# tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats
# T001269 — Mishap-Bundle: skills/dev-flow-execute, repo/worktree-state, ticket-mcp

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  DEV_FLOW_EXECUTE_SKILL="$REPO/.claude/skills/dev-flow-execute/SKILL.md"
  CONTRIBUTING_DOC="$REPO/CONTRIBUTING.md"
}

# ── Mishap 1: dev-flow-execute SKILL.md status conversion ────────────────────

@test "T001269: dev-flow-execute SKILL.md does not use the old status: active sed replacement" {
  [ -f "$DEV_FLOW_EXECUTE_SKILL" ]
  # The old command was: sed -i 's/^status: active$/status: completed/' "$PLAN_FILE"
  # The fix replaces it with a pattern supporting plan_staged, in_progress, etc.
  run grep -F 'sed -i '\''s/^status: active$/status: completed/'\''' "$DEV_FLOW_EXECUTE_SKILL"
  [ "$status" -ne 0 ]
}

@test "T001269: dev-flow-execute SKILL.md converts plan_staged/in_progress/active in sed" {
  [ -f "$DEV_FLOW_EXECUTE_SKILL" ]
  # The fix should match all active states in a single regex:
  # sed -E -i 's/^status: (active|plan_staged|in_progress)$/status: completed/'
  run grep -E 'sed -E -i '\''s/\^status: \(active\|plan_staged\|in_progress\)\$/status: completed/'\''' "$DEV_FLOW_EXECUTE_SKILL"
  [ "$status" -eq 0 ]
}

# ── Mishap 2: local settings loss warning ────────────────────────────────────

@test "T001269: CONTRIBUTING.md contains warnings about git reset --hard and data loss" {
  [ -f "$CONTRIBUTING_DOC" ]
  # The fix adds documentation about preserving local settings from git reset --hard.
  run grep -qi 'git reset --hard' "$CONTRIBUTING_DOC"
  [ "$status" -eq 0 ]
  run grep -qi 'git stash push -u' "$CONTRIBUTING_DOC"
  [ "$status" -eq 0 ]
}

# ── Mishap 3: MCP extension best practices ────────────────────────────────────

@test "T001269: CONTRIBUTING.md contains documentation for MCP extensions and tool registration" {
  [ -f "$CONTRIBUTING_DOC" ]
  # The fix adds guidelines for registering tools in ticket-mcp-go and verifying them.
  run grep -qi 'MCP-Erweiterung' "$CONTRIBUTING_DOC"
  [ "$status" -eq 0 ]
}
