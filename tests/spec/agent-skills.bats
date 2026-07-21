#!/usr/bin/env bats
# tests/spec/agent-skills.bats
# SSOT: openspec/specs/agent-skills.md
#
# Covers: dev-flow-chore git-crypt guard, ticket-ops dedup, agent-push notifications.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── dev-flow-chore: git-crypt smudge guard ────────────────────────────

@test "dev-flow-chore SKILL.md exists" {
  [ -f "$REPO/.claude/skills/dev-flow-chore/SKILL.md" ]
}

@test "dev-flow-chore Step 4 has Secret-in-index-Guard for git-crypt artifacts" {
  run grep -q 'Secret-in-index-Guard\|secret.*index.*guard\|git-crypt' "$REPO/.claude/skills/dev-flow-chore/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "dev-flow-chore skill refuses bare git add -A (mentions git-crypt)" {
  run grep -qi 'git.add.*-A\|git add -A\|git-crypt' "$REPO/.claude/skills/dev-flow-chore/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── ticket-ops: intake deduplication ──────────────────────────────────

@test "ticket-ops SKILL.md exists" {
  [ -f "$REPO/.claude/skills/ticket-ops/SKILL.md" ]
}

@test "ticket-ops skill mentions dedup or duplicate check" {
  run grep -qi 'dedup\|duplicate\|same.*title\|vorhanden.*Ticket' "$REPO/.claude/skills/ticket-ops/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── agent-push: notification delivery ─────────────────────────────────

@test "agent-push.sh exists and is executable" {
  [ -f "$REPO/scripts/agent-push.sh" ]
  [ -x "$REPO/scripts/agent-push.sh" ]
}

@test "agent-push.sh constructs ntfy topic from bachelorprojekt-\${SOURCE}" {
  run grep -q 'bachelorprojekt-' "$REPO/scripts/agent-push.sh"
  [ "$status" -eq 0 ]
}
