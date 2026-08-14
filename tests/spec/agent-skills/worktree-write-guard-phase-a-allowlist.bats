#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation
# Spec: agent-skills.md
# Fix: T005559

setup() {
  REPO_ROOT="$(pwd)"
  BATS_TMPDIR=$(mktemp -d)
  REPO="$BATS_TMPDIR/repo"
  mkdir -p "$REPO/wt-real"
  mkdir -p "$REPO/openspec/changes/some-change"
  mkdir -p "$REPO/.lavish"
  mkdir -p "$REPO/scripts"
  touch "$REPO/wt-real/README.md"
  touch "$REPO/openspec/changes/some-change/proposal.md"
  touch "$REPO/.lavish/some-change-brainstorm.html"
  touch "$REPO/scripts/foo.sh"

  cd "$REPO"
  git init -b main
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -m "chore: init"

  export AGENT_LOCK_DIR="$BATS_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"

  export SID="sid-phase-a-test"
  export AGENT_LOCK_SID="$SID"

  # Own lock on wt-real
  echo "{\"owner_sid\":\"$SID\",\"owner_pid\":\"1234\",\"worktree\":\"$REPO/wt-real\",\"branch\":\"feat/some-branch-T001111\",\"label\":\"live\"}" > "$AGENT_LOCK_DIR/branch__feat-some-branch-T001111.json"

  GUARD="$REPO_ROOT/scripts/hooks/worktree-write-guard.sh"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "worktree-write-guard: allows openspec/changes/* on main even when own worktree exists" {
  local TARGET="$REPO/openspec/changes/some-change/proposal.md"

  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"

  [ "$status" -eq 0 ]
}

@test "worktree-write-guard: allows .lavish/* on main even when own worktree exists" {
  local TARGET="$REPO/.lavish/some-change-brainstorm.html"

  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"

  [ "$status" -eq 0 ]
}

@test "worktree-write-guard: rejects non-Phase-A main-checkout writes when own worktree exists" {
  local TARGET="$REPO/scripts/foo.sh"

  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"

  [ "$status" -eq 2 ]
}

@test "worktree-write-guard: allows writes inside own claimed worktree" {
  local TARGET="$REPO/wt-real/README.md"

  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"

  [ "$status" -eq 0 ]
}
