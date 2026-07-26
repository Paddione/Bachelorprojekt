#!/usr/bin/env bash
# scripts/factory/merge-hooks.sh — helper functions for ticket merge/auto-close hooks
#
# Prevents auto-closing tickets on PR merge if multi-partial plans have remaining
# unimplemented partials.
set -euo pipefail

# check_partial_plan_completeness <ticket_id> [<repo_dir>]
#
# Checks if the ticket has partial tasks in openspec/changes/ or tasks.d/
# and whether any partial tasks remain incomplete.
#
# Exit codes:
#   0 = Plan complete or single-partial/no-partial plan (safe to auto-close)
#   1 = Incomplete partial plan (has uncompleted partials -> DO NOT auto-close)
check_partial_plan_completeness() {
  local ticket_id="${1:?usage: check_partial_plan_completeness <ticket_id> [<repo_dir>]}"
  local repo_dir="${2:-${REPO_ROOT:-.}}"

  # Normalize ticket_id to lowercase for directory searching if needed, e.g. T002102 -> t002102
  local lower_id
  lower_id=$(echo "$ticket_id" | tr '[:upper:]' '[:lower:]')

  # Search for active or staged change directory matching the ticket_id
  local change_dir=""
  for d in "$repo_dir/openspec/changes/"*"$lower_id"*; do
    if [[ -d "$d" ]]; then
      change_dir="$d"
      break
    fi
  done

  if [[ -z "$change_dir" || ! -d "$change_dir/tasks.d" ]]; then
    # No multi-partial directory found -> single partial or legacy plan -> allowed to close
    return 0
  fi

  # In a multi-partial directory (tasks.d/), check if all partial files or task items are completed.
  # If any tasks.d/p*.md file exists and is not marked as done or if tasks.md lists remaining partials:
  local partial_count
  partial_count=$(find "$change_dir/tasks.d" -name "p*.md" 2>/dev/null | wc -l || echo 0)

  if [[ "$partial_count" -le 1 ]]; then
    return 0
  fi

  # Check completed partials marker or partial-done status.
  # Look in tasks.md for uncompleted partial checkmarks `[ ]` or partial tasks
  if [[ -f "$change_dir/tasks.md" ]]; then
    # Check if there are unchecked task boxes `- [ ]` corresponding to partials or tasks
    if grep -q '^\s*-\s*\[\s*\]' "$change_dir/tasks.md"; then
      echo "check_partial_plan_completeness: ticket $ticket_id has incomplete tasks in $change_dir/tasks.md" >&2
      return 1
    fi
  fi

  # Check if there are tasks.d files that are not done
  # If any p*.md contains unchecked boxes
  for pfile in "$change_dir/tasks.d/"p*.md; do
    if [[ -f "$pfile" ]] && grep -q '^\s*-\s*\[\s*\]' "$pfile"; then
      echo "check_partial_plan_completeness: ticket $ticket_id has incomplete partial task in $pfile" >&2
      return 1
    fi
  done

  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  check_partial_plan_completeness "$@"
fi
