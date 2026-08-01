#!/usr/bin/env bash
# scripts/pr-scope-check.sh — Scope-Contamination-Guard for PRs [T002424]
#
# Checks that files modified on a branch are within the ticket's declared
# touched_files scope. Warns about "UNSCOPED" files that fall outside.
#
# Usage:
#   scripts/pr-scope-check.sh --ticket <ext-id> [--branch <branch>] [--allow-drift] [--strict]
#
# Options:
#   --ticket <ext-id>   Ticket external ID (required)
#   --branch <branch>   Branch to check (default: HEAD)
#   --allow-drift       Suppress warnings, exit 0 even if UNSCOPED files found
#   --strict            Exit 2 instead of 1 on UNSCOPED files (for CI)
#   --help              Show this help

set -euo pipefail
shopt -s inherit_errexit

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  sed -n '2,20p' "$0" | sed 's/^# //;s/^#$//'
  exit 0
}

TICKET=""
BRANCH="HEAD"
ALLOW_DRIFT=0
STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticket) TICKET="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --allow-drift) ALLOW_DRIFT=1; shift ;;
    --strict) STRICT=1; shift ;;
    --help) usage ;;
    *) echo "Usage: $0 --ticket <ext-id> [--branch <branch>] [--allow-drift] [--strict]" >&2; exit 1 ;;
  esac
done

if [[ -z "$TICKET" ]]; then
  echo "Usage: $0 --ticket <ext-id> [--branch <branch>] [--allow-drift] [--strict]" >&2
  exit 1
fi

# Get touched_files from ticket
TOUCHED_RAW=$(bash "$SCRIPT_DIR/vda/ticket.sh" get --id "$TICKET" --json 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    files = d.get('touched_files', []) or []
    print(' '.join(files))
except:
    print('')
") || true

declare -a TOUCHED_FILES=()
if [[ -n "$TOUCHED_RAW" ]]; then
  read -ra TOUCHED_FILES <<<"$TOUCHED_RAW"
fi

# Get diff of the branch vs main
DIFF_FILES=$(cd "$REPO" && git diff origin/main..."$BRANCH" --name-only 2>/dev/null || echo "")

declare -a UNSCOPED=()
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  local found=0
  for pattern in "${TOUCHED_FILES[@]}"; do
    # Glob matching: treat touched_files as patterns
    case "$file" in
      $pattern) found=1; break ;;
      ${pattern}/*) found=1; break ;;
      */${pattern}) found=1; break ;;
      */${pattern}/*) found=1; break ;;
    esac
  done
  if [[ $found -eq 0 ]]; then
    UNSCOPED+=("$file")
  fi
done < <(echo "$DIFF_FILES")

if [[ ${#UNSCOPED[@]} -gt 0 ]]; then
  echo "===== UNSCOPED Dateien (ausserhalb von touched_files) ====="
  printf '  %s\n' "${UNSCOPED[@]}"
  echo "==========================================================="
  
  if [[ "$ALLOW_DRIFT" -eq 1 ]]; then
    echo "[T002424] --allow-drift gesetzt: keine Blockade."
    exit 0
  elif [[ "$STRICT" -eq 1 ]]; then
    echo "[T002424] --strict: unerwartete Dateien gefunden. Exit 2."
    exit 2
  else
    echo "[T002424] Hinweis: Diese Dateien sind nicht in touched_files deklariert."
    echo "       Prüfen, ob sie zum Ticket-Scope gehören oder Drift sind."
    echo "       --allow-drift zum Unterdrücken, --strict für CI-fail-closed."
    exit 1
  fi
fi

echo "[OK] Alle geänderten Dateien sind im Scope von $TICKET."
exit 0
