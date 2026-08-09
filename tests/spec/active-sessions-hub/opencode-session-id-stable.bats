#!/usr/bin/env bats
# tests/spec/active-sessions-hub/opencode-session-id-stable.bats
# SSOT: openspec/specs/active-sessions-hub.md
#
# T002671 (Befund 3): opencode exports OPENCODE_SESSION_ID (confirmed by its own
# .opencode/hooks/session-start.sh / session-end.sh, which both read it as the
# session identity), but scripts/agent-lock-identity.sh and scripts/agent-lock.sh
# never check that variable — their harness-env allowlist only contains
# CLAUDE_CODE_SESSION_ID and CLAUDE_SESSION_ID. An opencode session therefore
# always falls through to the per-Bash-call Unix-SID fallback documented in
# T001268/T002381 as "the source of the drift bug": two separate `bash -c`
# invocations of the SAME opencode session can observe different SIDs, so a
# later ticket status write sees a "foreign" lock and needs the
# TICKET_LOCK_OVERRIDE=1 escape hatch (observed during T002628 execution,
# see openspec/changes/devflow-flow-frictions-T002671/proposal.md).
#
# The fix adds OPENCODE_SESSION_ID to the shared harness-env allowlist AND
# teaches _detect_tool an explicit "opencode" branch (checked before the
# generic sid-env branch, which would otherwise mislabel an opencode session
# as "claude").
#
# Verification mode: command output (CLAUDE.md Test-Resultats-Konvention) —
# every assertion sources the real fragment and calls the real _my_sid /
# _detect_tool functions; nothing here greps agent-lock*.sh source text.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  ALD="$(mktemp -d)"
  export AGENT_LOCK_DIR="$ALD"
}

teardown() {
  rm -rf "$ALD"
}

# ── Positiv-Anker: harness envs the fix must NOT regress ───────────────────#

@test "T002671: _my_sid still prefers AGENT_LOCK_SID override over any harness env (unchanged)" {
  run env -i AGENT_LOCK_SID="test-override" CLAUDE_CODE_SESSION_ID="claude-1" bash -c \
    "source '$REPO/scripts/agent-lock-identity.sh'; _my_sid"
  [ "$status" -eq 0 ]
  [ "$output" = "test-override" ]
}

@test "T002671: _my_sid still returns CLAUDE_CODE_SESSION_ID when set (unchanged)" {
  run env -i CLAUDE_CODE_SESSION_ID="claude-session-1" bash -c \
    "source '$REPO/scripts/agent-lock-identity.sh'; _my_sid"
  [ "$status" -eq 0 ]
  [ "$output" = "claude-session-1" ]
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ────────────────────────────#

@test "T002671: _my_sid returns the stable OPENCODE_SESSION_ID instead of the volatile per-call Unix SID (agent-lock-identity.sh)" {
  run env -i OPENCODE_SESSION_ID="oc-session-42" bash -c \
    "source '$REPO/scripts/agent-lock-identity.sh'; _my_sid"
  [ "$status" -eq 0 ]
  [ "$output" = "oc-session-42" ] \
    || { echo "erwartet 'oc-session-42' (stabile opencode-Session-ID), bekommen '$output' (Unix-SID-Fallback treibt pro Bash-Call)"; false; }
}

@test "T002671: agent-lock.sh claim records the stable OPENCODE_SESSION_ID as owner_sid, not the volatile per-call Unix SID" {
  # Real end-to-end path (no sourcing/reimplementation): claim a lock with
  # only OPENCODE_SESSION_ID set and inspect the JSON lock file it writes —
  # this exercises scripts/agent-lock.sh's OWN top-of-file _my_sid, which is
  # a separate copy of the allowlist from agent-lock-identity.sh and must be
  # fixed in lockstep or the two drift again.
  run env -i OPENCODE_SESSION_ID="oc-session-77" PATH="$PATH" AGENT_LOCK_DIR="$ALD" \
    bash "$LOCK" claim branch "fix/opencode-drift-check" --label test
  [ "$status" -eq 0 ] || { echo "claim schlug fehl: $output"; false; }

  [ -f "$ALD/branch__fix-opencode-drift-check.json" ] || { echo "Lock-Datei fehlt, ls: $(ls "$ALD")"; false; }
  local owner
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$ALD/branch__fix-opencode-drift-check.json")
  [ "$owner" = "oc-session-77" ] \
    || { echo "owner_sid war '$owner', erwartet stabile opencode-Session-ID 'oc-session-77' (Unix-SID-Fallback treibt pro Bash-Call)"; false; }
}

@test "T002671: _detect_tool reports 'opencode' for an OPENCODE_SESSION_ID-only session instead of 'unknown'" {
  run env -i OPENCODE_SESSION_ID="oc-session-42" bash -c \
    "source '$REPO/scripts/agent-lock-identity.sh'; _detect_tool"
  [ "$status" -eq 0 ]
  [ "$output" = "opencode" ] \
    || { echo "erwartet 'opencode', bekommen '$output' — OPENCODE_SESSION_ID wird nicht erkannt"; false; }
}
