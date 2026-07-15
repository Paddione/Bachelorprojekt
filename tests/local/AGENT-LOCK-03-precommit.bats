#!/usr/bin/env bats
# AGENT-LOCK-03: main-checkout guard + pre-commit hook integration [T000510]

setup() {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_TTL=1800
  export AGENT_LOCK_GRACE=0
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
}
teardown() { rm -rf "$AGENT_LOCK_DIR"; }

@test "AGENT-LOCK-03a: guard-precommit blocks a foreign live main-checkout lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" guard-precommit
  [ "$status" -eq 1 ]
  [[ "$output" == *"main-Checkout"* ]]
}

@test "AGENT-LOCK-03b: own main-checkout lock does not block" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03c: AGENT_LOCK_FORCE overrides the block" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" AGENT_LOCK_FORCE=1 run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03d: no lock => allowed" {
  AGENT_LOCK_SID=200 run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03e: dead foreign lock => reaped => allowed" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="200" run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03f: real pre-commit hook blocks in main but not in a worktree" {
  command -v git >/dev/null || skip "git not available"
  TMPBASE="$(mktemp -d)"
  TMPREPO="$TMPBASE/repo"; WTX="$TMPBASE/wtX"
  mkdir -p "$TMPREPO"
  git -C "$TMPREPO" init -q
  git -C "$TMPREPO" config user.email t@t; git -C "$TMPREPO" config user.name t
  mkdir -p "$TMPREPO/.githooks" "$TMPREPO/scripts"
  cp "$REPO_ROOT/scripts/agent-lock.sh" "$TMPREPO/scripts/"
  cp "$REPO_ROOT/.githooks/pre-commit" "$TMPREPO/.githooks/"
  # stub out the secret-guard so the hook only exercises the agent-lock gate
  printf '#!/usr/bin/env bash\nexit 0\n' > "$TMPREPO/scripts/git-crypt-guard.sh"
  chmod +x "$TMPREPO/scripts/git-crypt-guard.sh" "$TMPREPO/.githooks/pre-commit" "$TMPREPO/scripts/agent-lock.sh"
  git -C "$TMPREPO" config core.hooksPath .githooks
  export AGENT_LOCK_DIR="$TMPREPO/.git/agent-locks"
  # need at least one commit so a worktree branch can be created
  echo seed > "$TMPREPO/seed"; git -C "$TMPREPO" add seed
  AGENT_LOCK_SID=200 git -C "$TMPREPO" commit -q -m seed
  # foreign live main-checkout lock
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$TMPREPO/scripts/agent-lock.sh" claim main-checkout
  echo x > "$TMPREPO/f"; git -C "$TMPREPO" add f
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run git -C "$TMPREPO" commit -m "blocked"
  [ "$status" -ne 0 ]
  # a linked worktree (git-dir != common-dir) must NEVER be blocked
  git -C "$TMPREPO" worktree add -q "$WTX" -b wt-branch
  echo y > "$WTX/g"; git -C "$WTX" add g
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run git -C "$WTX" commit -m "allowed-in-worktree"
  [ "$status" -eq 0 ]
  git -C "$TMPREPO" worktree remove --force "$WTX" 2>/dev/null || true
  rm -rf "$TMPBASE"
}
