#!/usr/bin/env bash
# scripts/factory/filter-diff.sh — strip noise-file sections from a unified diff.
# Usage:
#   filter-diff.sh <ref>   → emits `git diff <ref>` with noise sections removed
#   filter-diff.sh -       → reads a unified diff from stdin, removes noise sections
# Exit 0 ALWAYS. Empty stdout = the whole diff was noise.
# Noise = lockfiles / *.min.js|css / *.bundle.js / *.map / generated-marker files,
# EXCEPT *.sql which is never stripped (schema changes must always be reviewed).
set -uo pipefail

_input_diff() {
  if [[ "${1:-}" == "-" ]]; then
    cat
  elif [[ -n "${1:-}" ]]; then
    git diff "$1"
  else
    echo "usage: filter-diff.sh <ref>|-" >&2
    return 0
  fi
}

# _is_noise_path <path> → exit 0 if the path is a noise file (and not .sql)
_is_noise_path() {
  local p="$1" base
  base="${p##*/}"
  # SQL is always reviewed — never noise.
  [[ "$p" == *.sql ]] && return 1
  case "$base" in
    pnpm-lock.yaml|package-lock.json|bun.lock|yarn.lock|go.sum|Cargo.lock|poetry.lock|flake.lock) return 0 ;;
  esac
  case "$p" in
    *.min.js|*.min.css|*.bundle.js|*.map) return 0 ;;
  esac
  return 1
}

# _has_generated_marker reads section body on stdin, checks first 5 added/context
# lines for a generated marker. Exit 0 if found.
_has_generated_marker() {
  local count=0 line
  while IFS= read -r line && (( count < 5 )); do
    # Only inspect added/context lines (skip diff metadata and removed lines).
    case "$line" in
      diff\ --git\ *|index\ *|---\ *|+++\ *|@@*) continue ;;
      -*)  continue ;;   # removed lines are already gone — don't count them
    esac
    count=$((count + 1))
    case "$line" in
      *@generated*|*auto-generated*|*"Code generated"*|*"DO NOT EDIT"*) return 0 ;;
    esac
  done
  return 1
}

main() {
  local diff
  diff="$(_input_diff "${1:-}")"
  [[ -z "$diff" ]] && return 0

  # Accumulate per-file sections, flush each through the filter.
  local -a section_lines=()
  local path="" in_section=0
  flush_section() {
    (( in_section )) || return 0
    local drop=0
    if [[ -n "$path" ]] && _is_noise_path "$path"; then
      drop=1
    elif [[ "$path" != *.sql ]] && printf '%s\n' "${section_lines[@]}" | _has_generated_marker; then
      drop=1
    fi
    if (( ! drop )); then
      printf '%s\n' "${section_lines[@]}"
    fi
    section_lines=()
    in_section=0
    path=""
  }

  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "diff --git "* ]]; then
      flush_section
      in_section=1
      # b-path is the last token "b/<path>"; strip the "b/" prefix.
      path="${line##* b/}"
    fi
    (( in_section )) && section_lines+=("$line")
  done <<< "$diff"
  flush_section
  return 0
}

main "$@"
