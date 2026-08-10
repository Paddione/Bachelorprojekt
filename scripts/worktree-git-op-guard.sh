#!/usr/bin/env bash
# worktree-git-op-guard.sh — reports interrupted git operations in any registered worktree.
#
# Usage: scripts/worktree-git-op-guard.sh [--quiet] [<repo-root>]
#
# Exit codes: 0 = no finding, 1 = at least one finding, 2 = invocation error.
#
# The guard inspects every worktree from `git worktree list --porcelain` and checks for
# in-progress rebase (rebase-merge / rebase-apply), merge (MERGE_HEAD) or cherry-pick
# (CHERRY_PICK_HEAD). It reports each affected worktree but does NOT attempt to continue,
# abort or otherwise modify the operation — repairing a foreign worktree's rebase can
# produce a wrong commit on a branch the caller does not own.
set -euo pipefail

quiet=false
repo_root=""

usage() {
  echo "Usage: $0 [--quiet] [<repo-root>]" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --quiet) quiet=true; shift ;;
    --help|-h) usage ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done

if [ $# -gt 0 ]; then
  repo_root="$1"
  if [ ! -d "$repo_root" ] || ! git -C "$repo_root" rev-parse --git-dir >/dev/null 2>&1; then
    echo "FATAL: <repo-root> '$repo_root' is not a git repository." >&2
    exit 2
  fi
else
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "FATAL: not inside a git repository and no <repo-root> given." >&2
    exit 2
  }
fi

# Collect all worktree paths.  Using --porcelain gives us machine-parseable output:
#   worktree /path/to/repo
#   HEAD <sha>
#   branch refs/heads/<name>
#   ...
# We only need the paths.
worktrees=()
while IFS=' ' read -r key value; do
  if [ "$key" = "worktree" ]; then
    worktrees+=("$value")
  fi
done < <(git -C "$repo_root" worktree list --porcelain)

if [ ${#worktrees[@]} -eq 0 ]; then
  $quiet || echo "No worktrees found."
  exit 0
fi

found_count=0

for wt in "${worktrees[@]}"; do
  # Determine the branch name.  During a rebase `git rev-parse --abbrev-ref HEAD`
  # returns "HEAD" (detached), so we fall back to the head-name file.
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch="(unknown)"
  if [ "$branch" = "HEAD" ]; then
    head_name_file="$(git -C "$wt" rev-parse --git-path rebase-merge/head-name 2>/dev/null)"
    if [ -f "$head_name_file" ]; then
      branch="$(cat "$head_name_file")"
    fi
  fi

  op_kind=""
  for candidate in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
    state_path="$(git -C "$wt" rev-parse --git-path "$candidate" 2>/dev/null)" || continue
    if [ -e "$state_path" ]; then
      case "$candidate" in
        rebase-merge)  op_kind="rebase (merge backend)" ;;
        rebase-apply)  op_kind="rebase (apply backend)" ;;
        MERGE_HEAD)    op_kind="merge in progress" ;;
        CHERRY_PICK_HEAD) op_kind="cherry-pick in progress" ;;
      esac
      break
    fi
  done

  if [ -n "$op_kind" ]; then
    # Check for unresolved conflicts.
    unresolved=""
    unresolved_files="$(git -C "$wt" diff --name-only --diff-filter=U 2>/dev/null)" || true
    if [ -n "$unresolved_files" ]; then
      unresolved=" (unresolved conflicts: $(echo "$unresolved_files" | head -3 | tr '\n' ' ' | sed 's/ $//'))"
      more=$(echo "$unresolved_files" | wc -l)
      if [ "$more" -gt 3 ]; then
        unresolved="$unresolved and $((more - 3)) more"
      fi
    else
      unresolved=" (all conflicts resolved, --continue ready)"
    fi

    echo "worktree=$wt branch=$branch operation=$op_kind$unresolved"
    found_count=$((found_count + 1))
  fi
done

if [ $found_count -eq 0 ]; then
  $quiet || echo "No interrupted git operations found."
  exit 0
fi

echo "$found_count worktree(s) with interrupted git operation(s)."
exit 1
