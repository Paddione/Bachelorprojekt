#!/usr/bin/env bash
# Shared, frontmatter-only provenance parsing for Brain ingest sources.
# Source bodies are untrusted prose: a body line that merely mentions an
# upstream revision must never become lifecycle metadata.

brain_source_frontmatter_value() {
  local file="$1" wanted="$2" line value first=1
  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$first" -eq 1 ]; then
      [ "$line" = "---" ] || return 1
      first=0
      continue
    fi
    [ "$line" = "---" ] && return 1
    case "$line" in
      "$wanted":*)
        value="${line#*:}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        value="${value#\"}"; value="${value%\"}"
        value="${value#\'}"; value="${value%\'}"
        printf '%s\n' "$value"
        return 0
        ;;
    esac
  done < "$file"
  return 1
}
