#!/usr/bin/env bash
# Create a git worktree that survives git-crypt-managed paths. [T000426]
#
# Why: `git worktree add` runs the git-crypt smudge filter while checking out
# the new worktree, but the new per-worktree gitdir (.git/worktrees/<name>) has
# no git-crypt key, so the checkout fails fatally (exit 128) and the worktree is
# rolled back — even when the MAIN checkout is unlocked. This wrapper creates the
# worktree WITHOUT checkout, then either (a) copies the git-crypt key into the
# worktree gitdir so checkout decrypts normally and ALL later git ops work
# (unlocked repo — key present but clean/required neutralized to prevent commit
# failures on git-crypt-managed files), or (b) neutralizes ALL git-crypt filters
# worktree-locally so checkout and later git ops pass encrypted blobs through
# verbatim, no key needed (locked repo). [T000925]
# Finally it inits submodules (the BATS runner lives in one).
#
# Usage: scripts/worktree-create.sh <branch> <path> [<base>]
#   <branch>  branch name, e.g. fix/foo. If it already exists (locally or on
#             origin) the worktree CHECKS IT OUT; otherwise a new branch is
#             created from <base>. The existing-branch mode is what the Software
#             Factory plan-reuse / dev-flow handoff path needs (T000473).
#   <path>    worktree path, e.g. .worktrees/foo (repo-relative default location)
#   <base>    base ref for a NEW branch (default: origin/main); ignored when the
#             branch already exists.
set -euo pipefail

# T001302/T001332: Divergence guard — auto-sync if local main is behind origin/main,
# reject if truly diverged.
# Only fires when origin/main exists (e.g. real upstream repos), so BATS tests with
# ephemeral test repos (no remote) are not affected.
if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  if ! git merge-base --is-ancestor origin/main main 2>/dev/null; then
    if git merge-base --is-ancestor main origin/main 2>/dev/null; then
      echo "worktree-create: local main is behind origin/main — fast-forwarding..." >&2
      _needs_pop=false
      if ! git diff --quiet HEAD 2>/dev/null; then
        git stash push -m "worktree-create-auto-stash" 2>/dev/null || true
        _needs_pop=true
      fi
      CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
      if [ "$CURRENT_BRANCH" = "main" ]; then
        git pull --rebase origin main 2>/dev/null || {
          echo "FATAL: auto-sync failed — could not pull origin/main into main." >&2
          $_needs_pop && git stash pop 2>/dev/null || true
          exit 1
        }
      else
        git fetch origin main:main 2>/dev/null || {
          echo "FATAL: auto-sync failed — could not fast-forward main." >&2
          $_needs_pop && git stash pop 2>/dev/null || true
          exit 1
        }
      fi
      $_needs_pop && git stash pop 2>/dev/null || true
      echo "worktree-create: local main synced to origin/main" >&2
    else
      echo "FATAL: local 'main' has diverged from 'origin/main'." >&2
      echo "       This means local main has diverged (likely from a past rebase)." >&2
      echo "       Fix with: git reset --hard origin/main" >&2
      exit 1
    fi
  fi
fi

BRANCH="${1:?Usage: worktree-create.sh <branch> <path> [<base>]}"
WT_PATH="${2:?Usage: worktree-create.sh <branch> <path> [<base>]}"
BASE="${3:-origin/main}"

# Absolute path to the SHARED gitdir (.../.git), valid from main or a worktree.
COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
KEY_SRC="$COMMON_DIR/git-crypt/keys/default"

# Does the branch already exist locally or on origin? Decides create-vs-checkout
# and whether rollback may delete the branch (never delete a pre-existing one).
BRANCH_EXISTS=0
if git show-ref --verify --quiet "refs/heads/$BRANCH" \
   || git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    BRANCH_EXISTS=1
fi

# Idempotency: drop a stale worktree at this path left by a prior aborted run
# (removing a worktree never deletes its branch). Lets the factory retry cleanly.
git worktree remove --force "$WT_PATH" 2>/dev/null || true
git worktree prune 2>/dev/null || true

# 1) Skeleton without checkout — never runs the smudge filter, so it cannot fail
#    on git-crypt paths.
if [ "$BRANCH_EXISTS" -eq 1 ]; then
    # Existing branch: fetch it so the local ref is current, then check it out.
    git fetch --quiet origin "$BRANCH" 2>/dev/null || true
    git worktree add --no-checkout "$WT_PATH" "$BRANCH"
else
    git worktree add --no-checkout -b "$BRANCH" "$WT_PATH" "$BASE"
fi

# Roll back the half-created worktree (+ the branch ONLY if we created it) if any
# later step fails (cp, checkout, submodule). Otherwise a retry hits a misleading
# "branch already exists" / "<path> already exists" that hides the original error.
_ok=0
_rollback() {
    [ "$_ok" -eq 1 ] && return
    echo "worktree-create: setup failed — rolling back $WT_PATH${BRANCH_EXISTS:+ (keeping existing branch $BRANCH)}" >&2
    git worktree remove --force "$WT_PATH" 2>/dev/null || true
    [ "$BRANCH_EXISTS" -eq 0 ] && git branch -D "$BRANCH" 2>/dev/null || true
}
trap _rollback EXIT

WT_GITDIR="$(git -C "$WT_PATH" rev-parse --absolute-git-dir)"

if [ -f "$KEY_SRC" ]; then
    # Unlocked: give the worktree its own copy of the key → real decryption.
    # Also neutralize clean/required so `git commit` of a git-crypt-managed file
    # never fails on a broken clean filter in the worktree gitdir. [T000925]
    mkdir -p "$WT_GITDIR/git-crypt/keys"
    cp "$KEY_SRC" "$WT_GITDIR/git-crypt/keys/default"
    git -C "$WT_PATH" config extensions.worktreeConfig true
    git -C "$WT_PATH" config --worktree filter.git-crypt.clean    cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.required false
    git -C "$WT_PATH" checkout
else
    # Locked (no key): neutralize git-crypt filters worktree-locally so checkout
    # and all later git ops use cat (passthrough). extensions.worktreeConfig must
    # be enabled before --worktree config entries are honored.
    git -C "$WT_PATH" config extensions.worktreeConfig true
    git -C "$WT_PATH" config --worktree filter.git-crypt.smudge   cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.clean    cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.required false
    git -C "$WT_PATH" checkout
    echo "worktree-create: repo is git-crypt LOCKED — secrets left encrypted-at-rest in $WT_PATH" >&2
fi

# T001331/T001332: Post-checkout stale-smudge detection for BRANCH_EXISTS=1 path.
# If the worktree was originally created in locked mode (smudge=cat) but the
# main checkout now has a key, the checkout above ran with the stale smudge
# filter — secrets are encrypted-at-rest in the worktree. Detect and fix.
# Also checks .claude/settings.json as fallback canary when .secrets dir is
# empty — that file is git-crypt-managed and surfaces the same stale smudge. [T001332]
if [ "$BRANCH_EXISTS" -eq 1 ] && [ -f "$KEY_SRC" ]; then
  canary="$(find "$WT_PATH/environments/.secrets" -type f 2>/dev/null | head -1)"
  if [ -z "$canary" ] && [ -f "$WT_PATH/.claude/settings.json" ]; then
    canary="$WT_PATH/.claude/settings.json"
  fi
  if [ -n "$canary" ] && bash "$(dirname "$0")/git-crypt-guard.sh" is-encrypted "$canary" 2>/dev/null; then
    echo "worktree-create: stale smudge filter detected (secrets encrypted despite unlocked repo) — re-initializing" >&2
    mkdir -p "$WT_GITDIR/git-crypt/keys"
    cp "$KEY_SRC" "$WT_GITDIR/git-crypt/keys/default"
    git -C "$WT_PATH" config extensions.worktreeConfig true
    git -C "$WT_PATH" config --worktree filter.git-crypt.clean    cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.required false
    git -C "$WT_PATH" checkout --force
  fi
fi

# Pre-compute MAIN_ROOT (needed by submodule fallback and node_modules symlink).
MAIN_ROOT="$(dirname "$COMMON_DIR")"

# 2) Init submodules (git worktree add does NOT; the BATS runner lives in one).
git -C "$WT_PATH" submodule update --init --recursive --quiet || {
    echo "worktree-create: submodule update failed — attempting local copy fallback" >&2
    for sm in tests/unit/lib/bats-core tests/unit/lib/bats-file tests/unit/lib/bats-support tests/unit/lib/bats-assert; do
        if [ -d "$MAIN_ROOT/$sm" ]; then
            rm -rf "$WT_PATH/$sm"
            cp -r "$MAIN_ROOT/$sm" "$WT_PATH/$sm"
        fi
    done
}


# 3) node_modules: git worktrees don't share the gitignored root node_modules,
#    and several `task test:all` subtasks (test:docs-gen, test:agent-guide) import
#    third-party packages from it. Symlink the base checkout's node_modules so the
#    worktree resolves deps instantly — no 536M reinstall, and the Taskfile's
#    `[ -d node_modules ] || npm ci` guards short-circuit (avoiding their race
#    under concurrent test:all). Skipped cleanly if the base has none. [T000526]
if [ -d "$MAIN_ROOT/node_modules" ] && [ ! -e "$WT_PATH/node_modules" ]; then
    ln -s "$MAIN_ROOT/node_modules" "$WT_PATH/node_modules"
    echo "worktree-create: linked node_modules → $MAIN_ROOT/node_modules" >&2
fi
# website uses pnpm — symlink its node_modules too so worktree skips full reinstall
if [ -d "$MAIN_ROOT/website/node_modules" ] && [ ! -e "$WT_PATH/website/node_modules" ]; then
    ln -s "$MAIN_ROOT/website/node_modules" "$WT_PATH/website/node_modules"
    echo "worktree-create: linked website/node_modules → $MAIN_ROOT/website/node_modules" >&2
fi

_ok=1   # reached a clean finish — disarm the rollback trap
if [ "$BRANCH_EXISTS" -eq 1 ]; then
    echo "worktree-create: $WT_PATH ready on existing branch $BRANCH"
else
    echo "worktree-create: $WT_PATH ready on branch $BRANCH (base $BASE)"
fi
