#!/usr/bin/env bats
# tests/spec/factory-branch-switch-guard.bats
# SSOT: openspec/specs/software-factory.md (+ agent-lock session coordination)
# T001383 — Factory-Prozess Branch-Wechsel im geteilten main-Checkout verhindern.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  GUARD="$REPO/scripts/factory/check-no-main-checkout.sh"
  TMP="$(mktemp -d)"
}
teardown() { rm -rf "$TMP"; }

@test "A: factory static guard passes on the clean scripts/factory tree" {
  run bash "$GUARD" "$REPO/scripts/factory"
  [ "$status" -eq 0 ]
}

@test "A2: factory static guard flags an injected raw checkout" {
  mkdir -p "$TMP/factory"
  printf '#!/usr/bin/env bash\ngit checkout main\n' > "$TMP/factory/bad.sh"
  run bash "$GUARD" "$TMP/factory"
  [ "$status" -ne 0 ]
  [[ "$output" == *"bad.sh"* ]]
}

@test "A3: factory static guard exempts a worktree-scoped checkout" {
  mkdir -p "$TMP/factory"
  printf '#!/usr/bin/env bash\ngit -C "$WORK_WT" checkout main\n' > "$TMP/factory/ok.sh"
  run bash "$GUARD" "$TMP/factory"
  [ "$status" -eq 0 ]
}

# Helper: throwaway repo on branch feature/x, isolated lock dir, pinned identity.
_mkrepo() {
  unset CLAUDE_SESSION_ID
  export AGENT_LOCK_SID="me-111"
  export AGENT_LOCK_DIR="$TMP/locks"; mkdir -p "$AGENT_LOCK_DIR"
  git init -q -b main "$TMP/repo"
  git -C "$TMP/repo" config user.email t@t
  git -C "$TMP/repo" config user.name t
  git -C "$TMP/repo" commit -q --allow-empty -m init
  git -C "$TMP/repo" branch feature/x
  git -C "$TMP/repo" checkout -q feature/x
}

# Helper: write a live FOREIGN main-checkout lock (owner_sid 999 faked-alive).
_foreign_lock() {  # <branch-value>
  export AGENT_LOCK_FAKE_ALIVE="999"
  cat > "$AGENT_LOCK_DIR/main-checkout.json" <<JSON
{
  "scope": "main-checkout",
  "id": "",
  "owner_sid": "999",
  "worktree": "-",
  "branch": "$1",
  "heartbeat_at": "$(date +%s)"
}
JSON
}

@test "B: guard-postcheckout is exempt during a rebase (no revert, no warning)" {
  _mkrepo
  _foreign_lock "feature/x"
  mkdir -p "$TMP/repo/.git/rebase-merge"
  git -C "$TMP/repo" checkout -q main
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-postcheckout"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ "$(git -C "$TMP/repo" rev-parse --abbrev-ref HEAD)" = "main" ]
}

@test "C: guard-postcheckout reverts to the lock's branch on a foreign switch" {
  _mkrepo
  _foreign_lock "feature/x"
  git -C "$TMP/repo" checkout -q main
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-postcheckout"
  [ "$status" -eq 0 ]
  [ "$(git -C "$TMP/repo" rev-parse --abbrev-ref HEAD)" = "feature/x" ]
}

@test "D: guard-postcheckout with empty branch warns only, no checkout" {
  _mkrepo
  _foreign_lock ""
  git -C "$TMP/repo" checkout -q main
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-postcheckout"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Warnung"* ]]
  [ "$(git -C "$TMP/repo" rev-parse --abbrev-ref HEAD)" = "main" ]
}

@test "E: guard-precommit self-claims main-checkout with the current branch" {
  _mkrepo
  git -C "$TMP/repo" checkout -q -b chore/y
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-precommit"
  [ "$status" -eq 0 ]
  br="$(sed -n 's/.*\"branch\": *\"\([^\"]*\)\".*/\1/p' "$AGENT_LOCK_DIR/main-checkout.json")"
  owner="$(sed -n 's/.*\"owner_sid\": *\"\([^\"]*\)\".*/\1/p' "$AGENT_LOCK_DIR/main-checkout.json")"
  [ "$br" = "chore/y" ]
  [ "$owner" = "me-111" ]
}

@test "F: guard-precommit self-claim of one session never hard-blocks a different session's ordinary commit" {
  _mkrepo
  # Session A commits in the main checkout — this self-claims the main-checkout lock as
  # bookkeeping (auto label), NOT a deliberate exclusive hold. [T001383 regression guard]
  export AGENT_LOCK_SID="sess-A"
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-precommit"
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/main-checkout.json" ]
  owner_a="$(sed -n 's/.*\"owner_sid\": *\"\([^\"]*\)\".*/\1/p' "$AGENT_LOCK_DIR/main-checkout.json")"
  [ "$owner_a" = "sess-A" ]
  # Session B commits shortly after — must NOT be blocked by session A's auto-claim.
  export AGENT_LOCK_SID="sess-B"
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-precommit"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
