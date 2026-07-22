#!/usr/bin/env bash
# Resolves Playwright e2e spec files matching changed source files.
# Uses test-inventory.json to map file path prefixes to relevant specs.
# Usage: bash scripts/find-changed-e2e-tests.sh
#
# Tier logic (most specific wins):
#   1. DIRECT — an e2e spec file itself changed → return that spec
#   2. CATEGORY — a source file changed → return specs whose category
#      matches the changed file's path prefix (e.g. website/src/ → FA, E2E)
#   3. BROAD — infra/manifest changes → return all e2e specs

set -euo pipefail

INVENTORY="website/src/data/test-inventory.json"
SPEC_DIR="tests/e2e/specs"

CHANGED=$(git diff --name-only HEAD origin/main 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)

if [ -z "$CHANGED" ]; then
  exit 0
fi

# Build a lookup: category → spec files from inventory
declare -A CAT_SPECS
if [ -f "$INVENTORY" ]; then
  while IFS=$'\t' read -r category file; do
    if [ -n "$file" ] && [ -f "$file" ]; then
      CAT_SPECS["$category"]+="$file"$'\n'
    fi
  done < <(python3 -c "
import json, sys
with open('$INVENTORY') as f:
    for item in json.load(f):
        if item.get('kind') == 'playwright' and item.get('file'):
            print(f\"{item.get('category','E2E')}\t{item['file']}\")
")
fi

# Map path prefix → category
path_to_category() {
  local path="$1"
  case "$path" in
    website/src/*|website/pages/*|website/components/*|website/layouts/*) echo "FA"; return ;;
    brett/src/*|brett/app/*)    echo "FA"; return ;;
    k3d/*|environments/*)       echo "NFA"; return ;;
    VideoVault/*)               echo "AK"; return ;;
    scripts/factory/*)          echo "SA"; return ;;
    *)                          echo ""; return ;;
  esac
}

# Detect if broad infra changed
is_broad_change() {
  local file
  for file in "$@"; do
    case "$file" in
      .github/workflows/*|Taskfile*|package.json|tests/e2e/playwright.config.ts) return 0 ;;
    esac
  done
  return 1
}

CANDIDATES=()

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  # Direct match: spec file changed
  if [[ "$file" == $SPEC_DIR/*.spec.ts ]]; then
    CANDIDATES+=("$file")
    continue
  fi

  # Category match: look up specs for the inferred category
  category=$(path_to_category "$file")
  if [ -n "$category" ] && [ -n "${CAT_SPECS[$category]:-}" ]; then
    while IFS= read -r spec; do
      CANDIDATES+=("$spec")
    done <<< "${CAT_SPECS[$category]}"
  fi
done <<< "$CHANGED"

# Broad infra change → return all playwright specs
if is_broad_change $CHANGED; then
  find "$SPEC_DIR" -maxdepth 1 -name "*.spec.ts" | sort
  exit 0
fi

# Deduplicate and output
if [ ${#CANDIDATES[@]} -gt 0 ]; then
  printf "%s\n" "${CANDIDATES[@]}" | sort -u
fi
