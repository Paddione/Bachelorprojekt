#!/usr/bin/env bash
# scripts/factory/classify-paths.sh — path classification for the Software Factory.
# SOURCE, do not execute. Defines paths_are_escalate_class.
#
# Escalate-class = (path starts with any prefix in shared-state-allowlist.txt)
#   UNION (path contains "secret" OR basename matches realm*.json OR ends in .sql).
# These touched_files mean a feature is touching shared cluster/secret/SQL state and
# must escalate (block) rather than auto-retry.

_CLASSIFY_PATHS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_SHARED_STATE_ALLOWLIST="${_CLASSIFY_PATHS_DIR}/shared-state-allowlist.txt"

# paths_are_escalate_class <comma-separated-files>
# Exit 0 if ANY path is escalate-class, else exit 1.
paths_are_escalate_class() {
  local csv="${1:-}"
  [[ -z "$csv" ]] && return 1

  local -a prefixes=()
  if [[ -f "$_SHARED_STATE_ALLOWLIST" ]]; then
    local line
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" ]] && continue
      prefixes+=("$line")
    done < "$_SHARED_STATE_ALLOWLIST"
  fi

  local IFS=','
  local -a files=($csv)
  unset IFS

  local f base p
  for f in "${files[@]}"; do
    [[ -z "$f" ]] && continue
    base="${f##*/}"
    # secret / realm*.json / *.sql
    if [[ "$f" == *secret* ]] || [[ "$base" == realm*.json ]] || [[ "$f" == *.sql ]]; then
      return 0
    fi
    # allowlist prefixes
    for p in "${prefixes[@]}"; do
      if [[ "$f" == "$p"* ]]; then
        return 0
      fi
    done
  done
  return 1
}
