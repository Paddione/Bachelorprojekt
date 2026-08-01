#!/usr/bin/env bats
# tests/spec/t002204-mishap-bundle.bats
# SSOT: openspec/changes/t002204-worktree-lock/proposal.md
# T002204 — Mishap-Bundle: scripts/worktree-create.sh, scripts/agent-lock.sh (2 Einträge).
#
#   M1 — scripts/worktree-create.sh only symlinked the repo-root and website/
#        node_modules into a fresh worktree. Any other pnpm-managed workspace
#        package (e.g. brett/, mentolder-web/) was left without a node_modules
#        symlink, so tooling that imports from those packages (vitest, tsc, ...)
#        failed inside the worktree with "module not found". Fix: discover every
#        directory with its own pnpm-workspace.yaml and link its node_modules
#        too, plus warn when the source checkout is on a different branch than
#        the new worktree (linked deps may not match).
#   M2 — scripts/agent-lock.sh cmd_reap / _reapable: a session resume changes the
#        process SID, so the pid-dead/sid-dead reap paths delete a still-live
#        claim (Pre-Commit Guard then fails with a false "branch mismatch").
#        Fix: before reaping, check whether the lock's recorded worktree path
#        exists AND the branch checked out there matches the lock's recorded
#        branch — if so, keep the lock alive despite the SID mismatch.
#
# RED phase — every test in this file MUST FAIL on the current
# scripts/worktree-create.sh / scripts/agent-lock.sh (before the fix) and MUST
# be GREEN after dev-flow-execute implementiert.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  HELPER="$REPO/scripts/worktree-create.sh"
  LOCK="$REPO/scripts/agent-lock.sh"
  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"
  export WT_SKIP_NAME_CHECK=1
}

teardown() { rm -rf "$TMP"; }

# ── Mishap 1: worktree-create.sh only links root + website node_modules ────#

_init_main_with_workspace_pkg() {
  MAIN="$TMP/main"
  mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name  Tester
  # A pnpm-managed workspace package other than website/ (mirrors brett/).
  mkdir -p "$MAIN/brett"
  printf 'allowBuilds:\n  esbuild: true\n' > "$MAIN/brett/pnpm-workspace.yaml"
  printf '{"name":"brett"}\n' > "$MAIN/brett/package.json"
  git -C "$MAIN" add -A
  git -C "$MAIN" commit -qm init
  # node_modules is created AFTER the commit — gitignored/untracked in the real
  # repo, so it must never appear in the worktree via checkout, only via the
  # helper's symlink logic (matches the T000526 root-node_modules test pattern).
  mkdir -p "$MAIN/brett/node_modules/some-dep"
  printf '{"name":"some-dep"}\n' > "$MAIN/brett/node_modules/some-dep/package.json"
}

@test "T002204-M1: a fresh worktree links node_modules for a non-website pnpm workspace package (brett/)" {
  _init_main_with_workspace_pkg
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/wt-brett-nm '$TMP/wt-brett-nm' HEAD"
  [ "$status" -eq 0 ]
  [ -e "$TMP/wt-brett-nm/brett/node_modules/some-dep/package.json" ]
  grep -q 'some-dep' "$TMP/wt-brett-nm/brett/node_modules/some-dep/package.json"
}

@test "T002204-M1: worktree-create still links the root node_modules alongside a workspace package's" {
  _init_main_with_workspace_pkg
  mkdir -p "$MAIN/node_modules/cheerio"
  printf '{"name":"cheerio"}\n' > "$MAIN/node_modules/cheerio/package.json"
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/wt-both-nm '$TMP/wt-both-nm' HEAD"
  [ "$status" -eq 0 ]
  [ -e "$TMP/wt-both-nm/node_modules/cheerio/package.json" ]
  [ -e "$TMP/wt-both-nm/brett/node_modules/some-dep/package.json" ]
}

@test "T002204-M1: worktree-create warns when the source checkout is on a different branch than the new worktree" {
  _init_main_with_workspace_pkg
  git -C "$MAIN" checkout -q -b feature/mismatched-source
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/wt-branchcheck '$TMP/wt-branchcheck' main"
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARNUNG"* || "$output" == *"Quell-Checkout"* ]]
}

# ── Mishap 2: agent-lock reap deletes a live claim after a session-resume SID change ─#

@test "T002204-M2: reap keeps a lock alive when its worktree still exists on the recorded branch, despite a dead/mismatched SID" {
  WT="$TMP/live-wt"
  mkdir -p "$WT"
  git init -q -b fix/t002204-demo "$WT"
  git -C "$WT" config user.email t@example.com
  git -C "$WT" config user.name  Tester
  printf 'x\n' > "$WT/f.txt"
  git -C "$WT" add -A
  git -C "$WT" commit -qm init

  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  AGENT_LOCK_SID="424242" \
    bash "$LOCK" claim ticket t002204-m2-live --label mishap2 \
    --worktree "$WT" --branch "fix/t002204-demo"
  LF="$AGENT_LOCK_DIR/ticket__t002204-m2-live.json"
  [ -f "$LF" ]
  # Simulate a session resume: the recorded owner_sid/owner_pid are now dead,
  # but the resumed session has renewed its heartbeat (re-claim/refresh) — the
  # worktree is still sitting right there on the exact recorded branch, so rule
  # 0b must keep the lock alive. An expired heartbeat would make it reapable
  # regardless of the worktree match [T002513].
  NOW="$(date +%s)"
  sed -i "s/\"owner_sid\": \"[^\"]*\"/\"owner_sid\": \"999998\"/" "$LF"
  sed -i "s/\"owner_pid\": \"[0-9]*\"/\"owner_pid\": \"999999\"/" "$LF"
  sed -i "s/\"heartbeat_at\": \"[0-9]*\"/\"heartbeat_at\": \"$NOW\"/" "$LF"

  bash "$LOCK" reap
  run bash "$LOCK" list
  [[ "$output" == *"t002204-m2-live"* ]]
  rm -rf "$AGENT_LOCK_DIR"
}

@test "T002204-M2 (regression guard): reap still drops a lock whose worktree branch no longer matches" {
  WT="$TMP/moved-wt"
  mkdir -p "$WT"
  git init -q -b fix/t002204-demo "$WT"
  git -C "$WT" config user.email t@example.com
  git -C "$WT" config user.name  Tester
  printf 'x\n' > "$WT/f.txt"
  git -C "$WT" add -A
  git -C "$WT" commit -qm init
  # The worktree has since moved on to a DIFFERENT branch than the lock recorded.
  git -C "$WT" checkout -q -b some-unrelated-branch

  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  AGENT_LOCK_SID="424243" \
    bash "$LOCK" claim ticket t002204-m2-stale --label mishap2 \
    --worktree "$WT" --branch "fix/t002204-demo"
  LF="$AGENT_LOCK_DIR/ticket__t002204-m2-stale.json"
  NOW="$(date +%s)"
  OLD=$(( NOW - 100000 ))
  sed -i "s/\"owner_sid\": \"[^\"]*\"/\"owner_sid\": \"999998\"/" "$LF"
  sed -i "s/\"owner_pid\": \"[0-9]*\"/\"owner_pid\": \"999999\"/" "$LF"
  sed -i "s/\"created_at\": \"[0-9]*\"/\"created_at\": \"$OLD\"/" "$LF"
  sed -i "s/\"heartbeat_at\": \"[0-9]*\"/\"heartbeat_at\": \"$OLD\"/" "$LF"

  bash "$LOCK" reap
  run bash "$LOCK" list
  [[ "$output" != *"t002204-m2-stale"* ]]
  rm -rf "$AGENT_LOCK_DIR"
}

# ── Mishap 3: pnpm install Guard (scripts/guard-pnpm-install.sh) ─────────#

@test "T002239-M3: guard-pnpm-install.sh exists and is executable" {
  [ -f "$REPO/scripts/guard-pnpm-install.sh" ] \
    || { echo "scripts/guard-pnpm-install.sh not found"; return 1; }
  [ -x "$REPO/scripts/guard-pnpm-install.sh" ] \
    || { echo "scripts/guard-pnpm-install.sh is not executable"; return 1; }
}

@test "T002239-M3: guard refuses pnpm install when node_modules is a symlink" {
  M3_TMP="$(mktemp -d)"
  mkdir -p "$M3_TMP/website/node_modules/.pnpm"
  # real node_modules → guard passes (pass the package dir, not the repo root)
  run bash "$REPO/scripts/guard-pnpm-install.sh" "$M3_TMP/website"
  [ "$status" -eq 0 ]

  # symlink node_modules → guard refuses
  rm -rf "$M3_TMP/website/node_modules"
  mkdir -p "$M3_TMP/real-nm"
  ln -s "$M3_TMP/real-nm" "$M3_TMP/website/node_modules"
  run bash "$REPO/scripts/guard-pnpm-install.sh" "$M3_TMP/website"
  [ "$status" -ne 0 ] || { echo "guard did not refuse (exit 0)"; return 1; }
  echo "$output" | grep -qi "refus" || { echo "guard output missing 'refus': $output"; return 1; }
  rm -rf "$M3_TMP"
}

@test "T002239-M3: worktree-create.sh source references guard-pnpm-install.sh" {
  grep -q 'guard-pnpm-install' "$REPO/scripts/worktree-create.sh" \
    || { echo "worktree-create.sh does not mention guard-pnpm-install.sh"; return 1; }
}
