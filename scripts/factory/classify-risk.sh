#!/usr/bin/env bash
# scripts/factory/classify-risk.sh — classify the risk tier of a diff.
# Usage: classify-risk.sh <ref>   → JSON {tier,linesChanged,fileCount,securityFiles,reason}
# Tiers: trivial | lite | full. Security-sensitive files force full.
# For offline unit tests, set CLASSIFY_NUMSTAT to the literal `git diff --numstat <ref>` text.
set -uo pipefail

_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${_HERE}/classify-paths.sh"

# Extra security prefixes from the spec that are NOT in shared-state-allowlist.txt.
_extra_security_prefix() {
  local p="$1"
  [[ "$p" == auth/* ]] && return 0
  [[ "$p" == scripts/factory/* ]] && return 0
  return 1
}

_json_string_array() {
  # prints a JSON array from newline-separated stdin (no trailing newline issues)
  local first=1 item
  printf '['
  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    (( first )) || printf ', '
    first=0
    printf '"%s"' "${item//\"/\\\"}"
  done
  printf ']'
}

main() {
  local ref="${1:-HEAD}" numstat
  if [[ -n "${CLASSIFY_NUMSTAT:-}" ]]; then
    numstat="$CLASSIFY_NUMSTAT"
  else
    numstat="$(git diff --numstat "$ref")"
  fi

  local lines=0 files=0 added deleted path
  local sec_files=""
  while IFS=$'\t' read -r added deleted path; do
    [[ -z "$path" ]] && continue
    files=$((files + 1))
    # binary files show "-" — treat as 0 lines.
    [[ "$added"   == "-" ]] && added=0
    [[ "$deleted" == "-" ]] && deleted=0
    lines=$((lines + added + deleted))
    if paths_are_escalate_class "$path" || _extra_security_prefix "$path"; then
      sec_files+="${path}"$'\n'
    fi
  done <<< "$numstat"

  local sec_json tier reason
  sec_json="$(printf '%s' "$sec_files" | _json_string_array)"

  if [[ -n "${sec_files//[$'\n\t ']/}" ]]; then
    tier="full"; reason="security-sensitive file(s) touched"
  elif (( lines > 100 || files > 15 )); then
    tier="full"; reason="diff exceeds full-tier threshold (>100 lines or >15 files)"
  elif (( lines > 10 || files > 5 )); then
    tier="lite"; reason="moderate diff (<=100 lines, <=15 files)"
  else
    tier="trivial"; reason="small diff (<=10 lines, <=5 files)"
  fi

  cat <<JSON
{
  "tier": "${tier}",
  "linesChanged": ${lines},
  "fileCount": ${files},
  "securityFiles": ${sec_json},
  "reason": "${reason}"
}
JSON
}

main "$@"
