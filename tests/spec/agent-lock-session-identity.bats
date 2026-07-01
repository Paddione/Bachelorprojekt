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

# ── T001386: Feature-Pfad fehlt expliziter Ticket-Claim vor Pre-Commit-Guard ──#
#
# dev-flow-plan Schritt 5's Pre-Commit-Guard (introduced by T001268-M2) checks
# .git/agent-locks/ticket__$TICKET_EXT_ID.json — a ticket-scoped agent-lock
# claim. The Fix-Pfad creates this claim explicitly in Schritt 2.5 ("claim
# ticket"). The Feature-Pfad's Phase B Schritt B.1 only claims `branch`, never
# `ticket` — because the ticket is normally created much later, in Schritt
# 4.5. The guard in Schritt 5 therefore reads a file that (in the Feature-Pfad)
# was never created, producing a false-negative branch-mismatch failure.
#
# Fix: the Feature-Pfad must gain an explicit `claim ticket` step, positioned
# where the ticket ID first becomes known — Schritt B.1 (if a ticket ID was
# already handed in, e.g. by feature-intake) AND/OR Schritt 4.5 (the regular
# case, right after the ticket is created/reused, before Schritt 5 runs).

@test "T001386: dev-flow-plan Feature-Pfad Schritt B.1 claims ticket when TICKET_EXT_ID is already known" {
  [ -f "$PLAN_SKILL" ]
  # Between the "Schritt B.1" heading and the next "Schritt B.2" heading, the
  # text must contain an agent-lock.sh claim ticket invocation.
  awk '/^#### Schritt B\.1:/{flag=1} /^#### Schritt B\.2:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eq 'agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket'
}

@test "T001386: dev-flow-plan Feature-Pfad Schritt 4.5 claims ticket after ticket creation, before Schritt 5" {
  [ -f "$PLAN_SKILL" ]
  # Between the "Schritt 4.5" heading and the next "Schritt 5" heading, the
  # text must contain an agent-lock.sh claim ticket invocation (Session-
  # Koordination [T000510]) so the Schritt 5 guard has something to read.
  awk '/^### Schritt 4\.5:/{flag=1} /^### Schritt 5:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eq 'agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket'
}

@test "T001386: dev-flow-plan Schritt 5 Pre-Commit-Guard checks lock-file existence before reading it" {
  [ -f "$PLAN_SKILL" ]
  # The branch-vs-claim check (guard check 3) must fail loudly with a
  # dedicated message if the ticket-scoped lock file is missing, instead of
  # silently comparing against an empty string from a failed jq lookup.
  awk '/^### Schritt 5:/{flag=1} /^### Schritt 6:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eqi '\-f[[:space:]]+"?\$LOCK_FILE"?|kein[[:space:]]+ticket-scoped[[:space:]]+agent-lock'
}
