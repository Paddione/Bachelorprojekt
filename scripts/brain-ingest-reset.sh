#!/usr/bin/env bash
# Shared state/reset helpers for brain-ingest.sh. This file is intentionally
# side-effect free when sourced so BATS can exercise the production functions
# without an LLM run or an undocumented early-exit environment switch.

brain_ingest_initialize_state() {
  local state_file="$1" dry_run="${2:-0}"

  if [ ! -f "$state_file" ]; then
    if [ "$dry_run" -eq 1 ]; then
      echo "DRY-RUN: would initialize missing state file to {}"
    else
      echo '{}' > "$state_file"
    fi
    return 0
  fi

  if ! jq -e 'type == "object"' "$state_file" >/dev/null 2>&1; then
    if [ "$dry_run" -eq 1 ]; then
      echo "DRY-RUN: would repair non-object state file to {}"
    else
      echo "State file is not a JSON object, resetting to {}" >&2
      echo '{}' > "$state_file"
    fi
  fi
}

brain_ingest_is_repo_source() {
  local src_line="$1" repo_root="$2" primary_root="${3:-}"
  local source_value="${src_line#source:: }"

  case "$source_value" in
    "Bachelorprojekt "*) return 0 ;;
    "$repo_root"/*) return 0 ;;
  esac

  if [ -n "$primary_root" ]; then
    case "$source_value" in
      "$primary_root"/*) return 0 ;;
    esac
  fi

  return 1
}

brain_ingest_reset_wiki() {
  local brain_repo="$1" state_file="$2" dry_run="$3" repo_root="$4"
  local primary_root="${5:-}" page slug src_line
  local reset_count=0 kept_count=0

  echo "=== Phase 1b: Wiki- und State-Reset (--from-scratch) ==="
  for page in "$brain_repo"/wiki/*.md; do
    [ -e "$page" ] || continue
    slug="$(basename "$page" .md)"
    src_line="$(grep -m1 '^source:: ' "$page" || true)"

    if [ -n "$src_line" ] && brain_ingest_is_repo_source "$src_line" "$repo_root" "$primary_root"; then
      if [ "$dry_run" -eq 1 ]; then
        echo "DRY-RUN: would delete wiki/$slug.md (source: ${src_line#source:: })"
      else
        rm -f "$page"
        echo "DELETED: wiki/$slug.md (source: ${src_line#source:: })"
      fi
      reset_count=$((reset_count + 1))
    else
      kept_count=$((kept_count + 1))
    fi
  done

  if [ "$dry_run" -eq 1 ]; then
    echo "DRY-RUN: would reset state file to {}"
    echo "Phase 1b: $reset_count pages would be deleted, $kept_count pages kept"
  else
    echo '{}' > "$state_file"
    echo "State file reset to {}"
    echo "Phase 1b: $reset_count pages deleted, $kept_count pages kept"
  fi
}
