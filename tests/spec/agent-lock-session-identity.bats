#!/usr/bin/env bats
# tests/spec/agent-lock-session-identity.bats
# SSOT: openspec/specs/active-sessions-hub.md (Identity is harness-stable)
# Consolidated BATS suite for the agent-lock / dev-flow mishap bundle (T001268).
# Covers the three mishaps from the bundle:
#   - Mishap 1: agent-lock-Session-Identität driftet pro Bash-Aufruf
#               (scripts/agent-lock.sh — _my_sid honours CLAUDE_SESSION_ID)
#   - Mishap 2: Local main hatte stale Commit der nie auf origin war
#               (skills/dev-flow-plan — explicit pre-commit guards)
#   - Mishap 3: Implementer-Subagent pusht Archive-Commits nicht
#               (skills/dev-flow-execute — push-verification checkpoint)
#
# This file is the RED phase of the fix: all three guards must FAIL on the
# current `fix/t001268-...` branch (and on main) before dev-flow-execute
# implements the fix. After the fix lands, all three must be GREEN.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  PLAN_SKILL="$REPO/.claude/skills/dev-flow-plan/SKILL.md"
  EXEC_SKILL="$REPO/.claude/skills/dev-flow-execute/SKILL.md"
}

# ── Mishap 1: agent-lock identity drift ────────────────────────────────#
#
# The Claude Code / opencode harness exposes a session ID for telemetry
# (CLAUDE_SESSION_ID). When it is set, scripts/agent-lock.sh MUST use it
# as the canonical owner identity so claims survive across bash tool calls.
# Currently _my_sid() only honours the test override AGENT_LOCK_SID — it
# does not check CLAUDE_SESSION_ID — so claims drift per call.

@test "T001268-M1: agent-lock uses CLAUDE_SESSION_ID as the owner_sid when set" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  unset AGENT_LOCK_SID
  export CLAUDE_SESSION_ID="claude-session-fixed-1234"
  run bash "$LOCK" claim ticket T001268-m1 --label mishap1
  [ "$status" -eq 0 ]
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T001268-m1.json")
  [ "$owner" = "claude-session-fixed-1234" ]
  rm -rf "$AGENT_LOCK_DIR"
}

@test "T001268-M1: agent-lock treats different CLAUDE_SESSION_ID values as different owners" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  unset AGENT_LOCK_SID
  export CLAUDE_SESSION_ID="session-A"
  bash "$LOCK" claim ticket T001268-m1b
  owner_a=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T001268-m1b.json")
  export CLAUDE_SESSION_ID="session-B"
  run bash "$LOCK" claim ticket T001268-m1b
  [ "$status" -eq 1 ]
  [[ "$output" == *"bereits gehalten"* ]]
  [ "$owner_a" = "session-A" ]
  rm -rf "$AGENT_LOCK_DIR"
}

# ── Mishap 2: dev-flow-plan stale-commit-on-main guard ──────────────────#
#
# The plan-stage commit in dev-flow-plan Schritt 5 must NEVER land on main.
# The skill must explicitly document: (a) refuse if current branch is main,
# (b) require git status to be clean, (c) cross-check branch against the
# agent-lock claim. Currently the skill says "git commit && git push" with
# no such guard.

@test "T001268-M2: dev-flow-plan SKILL.md explicitly forbids plan-stage commit on main" {
  [ -f "$PLAN_SKILL" ]
  # The rule must be present and clear: dev-flow-plan must instruct the
  # operator to NOT commit on main, and ideally cite a worktree branch
  # invariant.
  grep -Eqi 'do[[:space:]]+not[[:space:]]+commit[[:space:]]+on[[:space:]]+main|nicht[[:space:]]+auf[[:space:]]+main[[:space:]]+committen|refuse.*main|kein[[:space:]]+commit[[:space:]]+auf[[:space:]]+main|main.*verboten|main.*verweigern' "$PLAN_SKILL"
}

@test "T001268-M2: dev-flow-plan SKILL.md requires clean git status before plan-stage commit" {
  [ -f "$PLAN_SKILL" ]
  grep -Eqi 'git[[:space:]]+status.*(clean|leer|empty)|clean[[:space:]]+status|status.*clean|verify.*git[[:space:]]+status|sauberer[[:space:]]+status' "$PLAN_SKILL"
}

# ── Mishap 3: dev-flow-execute push-verification checkpoint ────────────#
#
# The archive steps in dev-flow-execute Schritt 7 must be push-required.
# The subagent return contract must include push_verified:<sha> AND the
# skill must instruct the operator to verify the push via git ls-remote
# before declaring the archive complete.

@test "T001268-M3: dev-flow-execute SKILL.md requires push verification via git ls-remote" {
  [ -f "$EXEC_SKILL" ]
  grep -Eqi 'ls-remote|verify.*origin|origin.*verify|push_verified' "$EXEC_SKILL"
}

@test "T001268-M3: dev-flow-execute SKILL.md mandates push_verified:<sha> in subagent return contract" {
  [ -f "$EXEC_SKILL" ]
  grep -Eqi 'push_verified:|push-verified:|push_verified[[:space:]]*=' "$EXEC_SKILL"
}
