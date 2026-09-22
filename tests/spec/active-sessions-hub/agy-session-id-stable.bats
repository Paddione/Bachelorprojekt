#!/usr/bin/env bats
# tests/spec/active-sessions-hub/agy-session-id-stable.bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T900306
#
# Antigravity (agy) exports ANTIGRAVITY_CONVERSATION_ID as its stable conversation
# identifier, but scripts/agent-lock-identity.sh, scripts/agent-lock.sh, and
# scripts/hooks/worktree-write-guard.sh only checked CLAUDE_CODE_SESSION_ID,
# CLAUDE_SESSION_ID, and OPENCODE_SESSION_ID.
# As a result, agy sessions suffered from SID drift on every Bash toolcall,
# causing worktree-write-guard to reject writes to its own claimed worktree.
#
# The fix adds ANTIGRAVITY_CONVERSATION_ID to the shared harness-env allowlist,
# teaches _detect_tool to report "agy", and updates worktree-write-guard.sh.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  GUARD="$REPO/scripts/hooks/worktree-write-guard.sh"
  ALD="$(mktemp -d)"
  export AGENT_LOCK_DIR="$ALD"

  WT="$BATS_TEST_TMPDIR/fake-repo"
  mkdir -p "$WT/sub"
  git -C "$WT" init -q
  git -C "$WT" config user.email t@example.com
  git -C "$WT" config user.name test
  git -C "$WT" commit -q --allow-empty -m init
}

teardown() {
  rm -rf "$ALD" "$WT"
}

@test "T900306: _my_sid returns stable ANTIGRAVITY_CONVERSATION_ID instead of volatile Unix SID" {
  run env -i ANTIGRAVITY_CONVERSATION_ID="agy-session-abc-123" bash -c \
    "source '$REPO/scripts/agent-lock-identity.sh'; _my_sid"
  [ "$status" -eq 0 ]
  [ "$output" = "agy-session-abc-123" ]
}

@test "T900306: agent-lock.sh claim records stable ANTIGRAVITY_CONVERSATION_ID as owner_sid and tool as agy" {
  run env -i ANTIGRAVITY_CONVERSATION_ID="agy-session-xyz-789" PATH="$PATH" AGENT_LOCK_DIR="$ALD" \
    bash "$LOCK" claim branch "fix/agy-drift-check" --label test
  [ "$status" -eq 0 ]

  local lock_file="$ALD/branch__fix-agy-drift-check.json"
  [ -f "$lock_file" ]
  local owner tool
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$lock_file")
  tool=$(sed -n 's/.*"tool": *"\([^"]*\)".*/\1/p' "$lock_file")
  [ "$owner" = "agy-session-xyz-789" ]
  [ "$tool" = "agy" ]
}

@test "T900306: _detect_tool reports 'agy' for an ANTIGRAVITY_CONVERSATION_ID session" {
  run env -i ANTIGRAVITY_CONVERSATION_ID="agy-session-42" bash -c \
    "source '$REPO/scripts/agent-lock-identity.sh'; _detect_tool"
  [ "$status" -eq 0 ]
  [ "$output" = "agy" ]
}

@test "T900306: worktree-write-guard allows write when writer has matching ANTIGRAVITY_CONVERSATION_ID" {
  # Create a claim owned by agy-session-99
  cat > "$ALD/branch__test-agy.json" <<EOF
{
  "scope": "branch",
  "id": "test-agy",
  "owner_sid": "agy-session-99",
  "owner_pid": "12345",
  "tool": "agy",
  "worktree": "$WT"
}
EOF

  # Writer with same ANTIGRAVITY_CONVERSATION_ID writing into claimed worktree
  run bash -c "printf '{\"tool_input\":{\"file_path\":\"%s/sub/file.ts\"}}' '$WT' | ( cd '$WT' && env -i PATH='$PATH' AGENT_LOCK_DIR='$ALD' ANTIGRAVITY_CONVERSATION_ID='agy-session-99' bash '$GUARD' )"
  [ "$status" -eq 0 ]
  ! grep -q "WARNUNG: worktree-write-guard _my_sid" <<< "$output"
}
