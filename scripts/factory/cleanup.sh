#!/usr/bin/env bash
# scripts/factory/cleanup.sh — remove factory branch + worktree after pipeline end.
#
# Best-effort: all steps are non-fatal; the script ALWAYS exits 0 so a missing
# worktree or already-deleted branch never blocks or masks the real pipeline result.
#
# Usage: cleanup.sh --branch <name> --worktree <path>
#   --branch    local branch to delete (e.g. feature/sf-t000469)
#   --worktree  worktree path to remove (e.g. .worktrees/sf-t000469)
set -euo pipefail

BRANCH=""
WT_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)   BRANCH="$2"; shift 2 ;;
    --worktree) WT_PATH="$2"; shift 2 ;;
    *)          echo "cleanup.sh: unknown option: $1" >&2; shift ;;
  esac
done

cleaned=()

# Belt-and-suspenders: even if a later step aborts, ensure the worktree is gone.
_trap_cleanup() {
  [[ -n "${WT_PATH:-}" && -d "${WT_PATH:-/nonexistent}" ]] && \
    git worktree remove --force "$WT_PATH" 2>/dev/null || true
}
trap _trap_cleanup EXIT

# 1) Remove the worktree (force — even if dirty). Idempotent: a missing worktree
#    is not an error (exit 0 from `git worktree remove --force`).
if [[ -n "$WT_PATH" ]] && [[ -d "$WT_PATH" ]]; then
  if git worktree remove --force "$WT_PATH" 2>/dev/null; then
    cleaned+=("worktree $WT_PATH")
  else
    # If git refuses (catastrophic corruption), fall back to rm -rf.
    rm -rf "$WT_PATH" 2>/dev/null || true
    echo "cleanup.sh: force-removed worktree directory $WT_PATH (git remove failed)" >&2
  fi
elif [[ -n "$WT_PATH" ]]; then
  echo "cleanup.sh: worktree $WT_PATH does not exist — nothing to remove" >&2
fi

# 2) Prune stale worktree metadata (safe post-remove housekeeping).
git worktree prune 2>/dev/null || true

# 3) Delete the local branch if it exists.
if [[ -n "$BRANCH" ]]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    if git branch -D "$BRANCH" 2>/dev/null; then
      cleaned+=("branch $BRANCH")
    else
      echo "cleanup.sh: could not delete branch $BRANCH (may be checked out elsewhere)" >&2
    fi
  else
    echo "cleanup.sh: branch $BRANCH does not exist locally — nothing to delete" >&2
  fi
fi

# 4) Report.
if [[ ${#cleaned[@]} -gt 0 ]]; then
  echo "cleanup.sh: removed ${cleaned[*]}"
else
  echo "cleanup.sh: nothing to clean up"
fi
