#!/usr/bin/env bash
# scripts/lib/worktree-gitdir-guard.sh — fail closed before writing from a worktree.
#
# T900066: a deleted worktree directory can make `git -C <worktree>` (or a
# shell that previously cd'ed there) walk up to the main checkout. Git then
# accepts add/commit normally, but writes to the wrong branch. Check the
# worktree's .git file before every write-capable git operation.

# Usage:
#   source scripts/lib/worktree-gitdir-guard.sh
#   worktree_validate_gitdir --worktree "$WT" --command-name "git commit"
worktree_validate_gitdir() {
  local worktree="" command_name="git operation" gitfile gitdir recorded_gitfile
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --worktree) worktree="${2:-}"; shift 2 ;;
      --command-name) command_name="${2:-}"; shift 2 ;;
      *) echo "FATAL [$command_name]: unknown worktree guard argument '$1'." >&2; return 2 ;;
    esac
  done
  if [[ -z "$worktree" ]]; then echo "FATAL [$command_name]: --worktree is required." >&2; return 2; fi
  if [[ ! -d "$worktree" ]]; then echo "FATAL [$command_name]: worktree '$worktree' no longer exists." >&2; return 1; fi

  # Check before calling Git: without this file, Git searches parents and finds
  # the main checkout instead of reporting the vanished worktree.
  gitfile="$worktree/.git"
  if [[ ! -f "$gitfile" ]]; then
    echo "FATAL [$command_name]: '$gitfile' is missing; refusing to write via a fallback main checkout." >&2
    return 1
  fi
  if ! IFS= read -r recorded_gitfile < "$gitfile" || [[ "$recorded_gitfile" != gitdir:\ * ]]; then
    echo "FATAL [$command_name]: '$gitfile' is not a linked-worktree gitdir file." >&2
    return 1
  fi
  gitdir="${recorded_gitfile#gitdir: }"
  if [[ "$gitdir" != /* ]]; then gitdir="$(cd "$worktree" && cd "$(dirname "$gitdir")" && pwd -P)/$(basename "$gitdir")"; fi
  if [[ ! -d "$gitdir" ]]; then echo "FATAL [$command_name]: linked gitdir '$gitdir' is missing." >&2; return 1; fi
  if ! IFS= read -r recorded_gitfile < "$gitdir/gitdir"; then
    echo "FATAL [$command_name]: '$gitdir/gitdir' is missing or unreadable." >&2; return 1
  fi
  if [[ "$(cd "$(dirname "$recorded_gitfile")" 2>/dev/null && pwd -P)/$(basename "$recorded_gitfile")" != "$(cd "$worktree" && pwd -P)/.git" ]]; then
    echo "FATAL [$command_name]: linked gitdir does not belong to '$worktree'." >&2; return 1
  fi
  if [[ "$(git -C "$worktree" rev-parse --absolute-git-dir 2>/dev/null || true)" != "$gitdir" ]]; then
    echo "FATAL [$command_name]: Git resolved a different gitdir for '$worktree'." >&2; return 1
  fi
}
