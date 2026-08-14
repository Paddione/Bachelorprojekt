#!/usr/bin/env bash
# Block commits that stage NEW openspec/changes/<slug>/ directories in the
# main checkout.  Linked worktrees are exempt — the sanctioned flow moves
# the change scaffold into a worktree before committing (opencode-flow-plan B.2).
#
# Bypass: SKIP_MAIN_STAGING_GUARD=1 git commit ...
# See: T003980, openspec/changes/main-staging-guard/
set -euo pipefail

# --- bypass ---
if [ "${SKIP_MAIN_STAGING_GUARD:-0}" = "1" ]; then
  exit 0
fi

# --- main-checkout detection ---
# In the main checkout, show-toplevel == dirname(git-common-dir).
# In a linked worktree, git-common-dir points into <main>/.git/worktrees/<name>,
# so dirname(git-common-dir) resolves to the main repo root — different from
# the worktree's toplevel.
toplevel="$(git rev-parse --path-format=absolute --show-toplevel 2>/dev/null)" || exit 0
common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
main_root="$(dirname "$common_dir")"

if [ "$toplevel" != "$main_root" ]; then
  exit 0
fi

# --- new-slug detection ---
staged="$(git diff --cached --name-only 2>/dev/null)" || exit 0
[ -n "$staged" ] || exit 0

new_slugs=()
while IFS= read -r path; do
  case "$path" in
    openspec/changes/archive/*) continue ;;
    openspec/changes/*)
      slug="${path#openspec/changes/}"
      slug="${slug%%/*}"
      [ -n "$slug" ] || continue
      if ! git cat-file -e "HEAD:openspec/changes/$slug" 2>/dev/null; then
        new_slugs+=("$slug")
      fi
      ;;
  esac
done <<< "$staged"

if [ ${#new_slugs[@]} -gt 0 ]; then
  unique_slugs=($(printf '%s\n' "${new_slugs[@]}" | sort -u))
  echo "ERROR: new OpenSpec change slug(s) staged in the main checkout:" >&2
  for s in "${unique_slugs[@]}"; do
    echo "  • openspec/changes/$s/" >&2
  done
  echo "" >&2
  echo "OpenSpec changes must be committed in a worktree, not the main checkout." >&2
  echo "Fix: move the change to a worktree (scripts/worktree-create.sh or opencode-flow-plan B.2)." >&2
  echo "Bypass (emergency only): SKIP_MAIN_STAGING_GUARD=1 git commit ..." >&2
  exit 1
fi

exit 0
