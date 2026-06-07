#!/usr/bin/env bash
# Create a git worktree that survives git-crypt-managed paths. [T000426]
#
# Why: `git worktree add` runs the git-crypt smudge filter while checking out
# the new worktree, but the new per-worktree gitdir (.git/worktrees/<name>) has
# no git-crypt key, so the checkout fails fatally (exit 128) and the worktree is
# rolled back — even when the MAIN checkout is unlocked. This wrapper creates the
# worktree WITHOUT checkout, then either (a) copies the git-crypt key into the
# worktree gitdir so checkout decrypts normally and ALL later git ops work
# (unlocked repo), or (b) neutralizes the git-crypt filters worktree-locally so
# checkout and later git ops pass encrypted blobs through verbatim, no key needed
# (locked repo). Finally it inits submodules (the BATS runner lives in one).
#
# Usage: scripts/worktree-create.sh <branch> <path> [<base>]
#   <branch>  branch name, e.g. fix/foo. If it already exists (locally or on
#             origin) the worktree CHECKS IT OUT; otherwise a new branch is
#             created from <base>. The existing-branch mode is what the Software
#             Factory plan-reuse / dev-flow handoff path needs (T000473).
#   <path>    worktree path, e.g. /tmp/wt-foo
#   <base>    base ref for a NEW branch (default: origin/main); ignored when the
#             branch already exists.
set -euo pipefail

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
    mkdir -p "$WT_GITDIR/git-crypt/keys"
    cp "$KEY_SRC" "$WT_GITDIR/git-crypt/keys/default"
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

# 2) Init submodules (git worktree add does NOT; the BATS runner lives in one).
git -C "$WT_PATH" submodule update --init --recursive --quiet

_ok=1   # reached a clean finish — disarm the rollback trap
if [ "$BRANCH_EXISTS" -eq 1 ]; then
    echo "worktree-create: $WT_PATH ready on existing branch $BRANCH"
else
    echo "worktree-create: $WT_PATH ready on branch $BRANCH (base $BASE)"
fi
