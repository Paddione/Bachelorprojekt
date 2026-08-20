#!/usr/bin/env bash
set -euo pipefail

# Mocking the worktree list
function git() {
  if [[ "$1" == "worktree" && "$2" == "list" && "$3" == "--porcelain" ]]; then
    echo "worktree /tmp/wt1"
    echo "HEAD abc1234"
    echo "branch refs/heads/feature/active-branch"
    echo ""
    echo "worktree /tmp/wt2"
    echo "HEAD def5678"
    echo "branch refs/heads/feature/another-branch"
    echo ""
  elif [[ "$1" == "rev-parse" ]]; then
    echo "some-sha"
  else
    echo "mock-output"
  fi
}

# The logic to inject
# 1. Get checked out branches from worktrees
# We need to strip "refs/heads/" but keep the rest
mapfile -t WORKTREE_BRANCHES < <(git worktree list --porcelain | grep "^branch refs/heads/" | sed 's/^branch refs\/heads\///')

echo "Detected worktree branches:"
printf '%s\n' "${WORKTREE_BRANCHES[@]}"

# Test candidates
CANDIDATES=("feature/active-branch" "feature/another-branch" "feature/to-be-reaped")

for branch in "${CANDIDATES[@]}"; do
  # Check if in worktree
  in_worktree=0
  for wb in "${WORKTREE_BRANCHES[@]}"; do
    if [[ "$branch" == "$wb" ]]; then
      in_worktree=1
      break
    fi
  done

  if [[ $in_worktree -eq 1 ]]; then
    echo "KEEP $branch — in einem Worktree ausgecheckt"
  else
    echo "REAP $branch"
  fi
done
