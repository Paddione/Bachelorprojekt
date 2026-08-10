#!/usr/bin/env bash
#
# find-similar.sh — Token-basierte Dublettenerkennung ohne Embeddings [T003117/T003120]
#
# Sourced by scripts/ticket.sh (which has set -euo pipefail).
# All grep exits are guarded so no-match does not abort the pipeline.

STOPWORDS="scripts skills tests spec hook hooks"
MIN_TOKEN_LEN=4

# ── helpers ──────────────────────────────────────────────────────────────────

_tokenize() {
  local s="$1"
  printf '%s\n' "$s" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_\/\.-]/ /g' | tr '/ ' '\n\n' | { grep -E '.{'"$MIN_TOKEN_LEN"',}' || true; }
}

_is_stopword() {
  local t="$1"
  for sw in $STOPWORDS; do
    [ "$t" = "$sw" ] && return 0
  done
  return 1
}

_filter_tokens() {
  local t
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    [ "${#t}" -lt "$MIN_TOKEN_LEN" ] && continue
    _is_stopword "$t" && continue
    printf '%s\n' "$t"
  done
}

_extract_refs() {
  local text="$1" tmp
  tmp="$(mktemp)" || { echo ""; return; }
  # Each extraction is best-effort; empty results are OK
  { printf '%s\n' "$text" | grep -oP '[a-zA-Z0-9_./-]+/[a-zA-Z0-9_./-]+' >> "$tmp"; } 2>/dev/null || true
  { printf '%s\n' "$text" | grep -oP '\b[a-zA-Z0-9_./-]+\.\w{1,10}\b' >> "$tmp"; } 2>/dev/null || true
  { printf '%s\n' "$text" | grep -oP 'T\d{6,}' >> "$tmp"; } 2>/dev/null || true
  # Numbers with 4+ digits, excluding ISO date years
  { printf '%s\n' "$text" | grep -oP '\b\d{4,}\b' 2>/dev/null || true; } | while read -r num; do
    [ -z "$num" ] && continue
    if [ "${#num}" -eq 4 ] && printf '%s\n' "$text" | grep -qP "${num}-\d{2}-\d{2}" 2>/dev/null; then
      continue
    fi
    printf '%s\n' "$num"
  done >> "$tmp"
  cat "$tmp" 2>/dev/null
  rm -f "$tmp"
}

_share_token() {
  local set1="$1" set2="$2"
  local t u
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    if printf '%s\n' "$set2" | grep -qxF "$t" 2>/dev/null; then
      return 0
    fi
    while IFS= read -r u; do
      [ -z "$u" ] && continue
      case "$u" in *"$t"*) return 0 ;; esac
    done <<<"$set2"
  done <<<"$set1"
  return 1
}

_first_shared() {
  local set1="$1" set2="$2"
  local t
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    if printf '%s\n' "$set2" | grep -qxF "$t" 2>/dev/null; then
      printf '%s\n' "$t"
      return 0
    fi
  done <<<"$set1"
  return 1
}

# ── main ─────────────────────────────────────────────────────────────────────

cmd_find_similar() {
  local corpus=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --corpus) corpus="$2"; shift 2 ;;
      --corpus=*) corpus="${1#*=}"; shift ;;
      *) shift ;;
    esac
  done

  if [ -z "$corpus" ]; then
    echo "find-similar: --corpus is required (DB-backed mode not yet implemented)" >&2
    exit 1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    echo "find-similar: jq is required" >&2
    exit 1
  fi

  local ids areas titles descs comp_tokens ref_tokens
  ids=(); areas=(); titles=(); descs=(); comp_tokens=(); ref_tokens=()

  local n i
  n=$(jq '.tickets | length' "$corpus") || { echo "find-similar: failed to read corpus" >&2; exit 1; }
  for i in $(seq 0 $((n - 1))); do
    ids+=("$(jq -r ".tickets[$i].id" "$corpus")")
    areas+=("$(jq -r ".tickets[$i].areas // \"\"" "$corpus")")
    titles+=("$(jq -r ".tickets[$i].title // \"\"" "$corpus")")
    descs+=("$(jq -r ".tickets[$i].description // \"\"" "$corpus")")
  done

  for i in $(seq 0 $((n - 1))); do
    local ct
    ct="$(_tokenize "${areas[$i]}" | _filter_tokens | sort -u)" || ct=""
    comp_tokens+=("$ct")

    local refs filtered_refs r piece ctok purely_component found
    refs="$(_extract_refs "${titles[$i]} ${descs[$i]}" | sort -u)" || refs=""

    filtered_refs=""
    while IFS= read -r r; do
      [ -z "$r" ] && continue
      if printf '%s\n' "$ct" | grep -qxF "$r" 2>/dev/null; then
        continue
      fi
      purely_component=1
      for piece in ${r//\// }; do
        [ -z "$piece" ] && continue
        # Skip stopword pieces like "scripts" — they're filtered from component tokens too
        _is_stopword "$piece" && continue
        if printf '%s\n' "$ct" | grep -qxF "$piece" 2>/dev/null; then
          continue
        fi
        found=0
        for ctok in $ct; do
          case "$ctok" in *"$piece"*) found=1; break ;; esac
        done
        [ "$found" -eq 0 ] && { purely_component=0; break; }
      done
      [ "$purely_component" -eq 1 ] && continue
      filtered_refs="${filtered_refs}${r}"$'\n'
    done <<<"$refs"
    ref_tokens+=("$filtered_refs")
  done

  local found_any=0 shared_ref
  for i in $(seq 0 $((n - 2))); do
    for j in $(seq $((i + 1)) $((n - 1))); do
      if ! _share_token "${comp_tokens[$i]}" "${comp_tokens[$j]}"; then
        continue
      fi
      shared_ref="$(_first_shared "${ref_tokens[$i]}" "${ref_tokens[$j]}" 2>/dev/null)" || continue
      echo "${ids[$i]} ${ids[$j]} ${shared_ref}"
      found_any=1
    done
  done

  return 0
}
