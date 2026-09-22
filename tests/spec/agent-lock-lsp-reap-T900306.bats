#!/usr/bin/env bats
# tests/spec/agent-lock-lsp-reap-T900306.bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T900306
#
# Background language servers (e.g. typescript-language-server, tsserver)
# persist indefinitely with their cwd inside worktrees even after an agent or
# tool has finished.
# _worktree_has_active_process previously treated these passive daemons as
# "active sessions", preventing dead locks from being reaped (both via pid-dead
# after grace, and via heartbeat-ttl).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  ACTIVITY_LIB="$REPO_ROOT/scripts/agent-lock-activity.sh"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_SID="t900306-test"
  export AGENT_LOCK_GRACE=2

  WT="$BATS_TEST_TMPDIR/fake-wt"
  mkdir -p "$WT"
  git -C "$WT" init -q
  git -C "$WT" config user.email t@example.com
  git -C "$WT" config user.name test
  git -C "$WT" commit -q --allow-empty -m init
  git -C "$WT" checkout -q -b fix/demo-lsp-reap

  LSP_PID=""
}

teardown() {
  [ -n "${LSP_PID:-}" ] && kill -9 "$LSP_PID" 2>/dev/null || true
  rm -rf "$AGENT_LOCK_DIR" "$WT"
}

@test "T900306: _worktree_has_active_process ignores typescript-language-server" {
  source "$ACTIVITY_LIB"

  # Spawn a simulated language server process in the worktree
  ( cd "$WT" && exec -a typescript-language-server sleep 30 ) &
  LSP_PID=$!
  sleep 0.2

  # The only process in $WT is an LSP daemon: _worktree_has_active_process must return 1 (false)
  run _worktree_has_active_process "$WT"
  [ "$status" -eq 1 ]
}

@test "T900306: agent-lock reap clears dead-pid lock despite idle language server in worktree" {
  local ts=$(( $(date +%s) - 30 )) # 30s ago (> 2s grace)
  cat > "$AGENT_LOCK_DIR/ticket__T900306-dead.json" <<EOF
{
  "scope": "ticket",
  "id": "T900306-dead",
  "owner_sid": "999999",
  "owner_pid": "4194303",
  "tool": "claude",
  "label": "dead-holder",
  "worktree": "$WT",
  "branch": "fix/demo-lsp-reap",
  "created_at": "$ts",
  "heartbeat_at": "$ts"
}
EOF

  # Spawn an idle language server in $WT
  ( cd "$WT" && exec -a typescript-language-server sleep 30 ) &
  LSP_PID=$!
  sleep 0.2

  # Run agent-lock check / reap:
  # With the bug, _holder_active_in_worktree found the LSP and refused to reap (check returned "held").
  # With the fix, the dead-pid lock is reapable (check returns "free" and reap cleans it up).
  run bash "$AGENT_LOCK" reap
  [ "$status" -eq 0 ]
  [ ! -f "$AGENT_LOCK_DIR/ticket__T900306-dead.json" ]
}
