#!/usr/bin/env bats
# Tests for scripts/agent-collision.sh — active live edit-collision detection. [T000882]
#
# Reuses agent-lock.sh's claim store (read-only) for peer discovery. Fixtures use
# real `git worktree add` checkouts created OUTSIDE the repo tree (in $BATS_TMPDIR
# via mktemp -d), per CLAUDE.md Dev-Rule #8, with teardown cleanup. Peer liveness
# and identity are driven by the documented agent-lock overrides:
#   AGENT_LOCK_DIR (claim store), AGENT_LOCK_SID (my session id),
#   AGENT_LOCK_FAKE_ALIVE (space-separated list of "alive" SIDs).

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../scripts/agent-collision.sh"
  TMP="$(mktemp -d "${BATS_TMPDIR:-/tmp}/agent-collision.XXXXXX")"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  MAIN="$TMP/main"; mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name Tester
  printf 'base\n' > "$MAIN/shared.txt"
  printf 'base\n' > "$MAIN/other.txt"
  git -C "$MAIN" add -A && git -C "$MAIN" commit -qm init

  WT_A="$TMP/wt-a"; WT_B="$TMP/wt-b"
  git -C "$MAIN" worktree add -q -b feat-a "$WT_A" HEAD
  git -C "$MAIN" worktree add -q -b feat-b "$WT_B" HEAD

  export AGENT_LOCK_DIR="$TMP/locks"; mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_SID="1111"
  export AGENT_LOCK_FAKE_ALIVE="1111 2222"
}

teardown() {
  git -C "$MAIN" worktree remove --force "$WT_A" 2>/dev/null || true
  git -C "$MAIN" worktree remove --force "$WT_B" 2>/dev/null || true
  rm -rf "$TMP"
}

_peer_claim() {
  cat > "$AGENT_LOCK_DIR/$1" <<EOF
{
  "scope": "branch",
  "id": "feat-b",
  "owner_sid": "$2",
  "tool": "gemini",
  "label": "dev-flow-execute",
  "worktree": "$3",
  "branch": "feat-b"
}
EOF
}

@test "overlapping in-flight file → exit 1 + COLLISION line naming the file" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'COLLISION'
  echo "$output" | grep -q 'shared.txt'
}

@test "no overlap → exit 0" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/other.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "stale (dead) peer is ignored → exit 0" {
  export AGENT_LOCK_FAKE_ALIVE="1111"
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "missing peer worktree → fail-open exit 0" {
  _peer_claim peer.json 2222 "$TMP/gone"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "own SID is excluded (not a self-collision) → exit 0" {
  _peer_claim mine.json 1111 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "--all includes unstaged own files" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  run bash -c "cd '$WT_A' && bash '$HELPER' check --all"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'shared.txt'
}

@test "--quiet suppresses the warning lines but keeps the exit code" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged --quiet"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "no peers at all → exit 0" {
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}
