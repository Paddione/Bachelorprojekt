#!/usr/bin/env bash
# Resolves BATS files matching changed files.
# Usage: bash scripts/find-changed-tests.sh [unit|spec]

set -euo pipefail

TYPE="${1:-unit}" # "unit" or "spec"
BASE_DIR="tests/${TYPE}"
ALLOWLIST="tests/unit/.coverage-allowlist"

# Get the list of changed files against main
CHANGED=$(git diff --name-only HEAD origin/main 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)

if [ -z "$CHANGED" ]; then
  exit 0
fi

CANDIDATES=()
RUN_ALL=false

is_excluded() {
  local bats_file="$1"
  if [ "$TYPE" != "unit" ]; then
    return 1
  fi
  local base
  base=$(basename "$bats_file" .bats)
  if [ -f "$ALLOWLIST" ] && grep -q "^$base$" "$ALLOWLIST"; then
    return 0
  fi
  return 1
}

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  
  # If it is a test file in our base dir, it's a direct candidate
  if [[ "$file" == "$BASE_DIR"/*.bats ]]; then
    if ! is_excluded "$file"; then
      CANDIDATES+=("$file")
    fi
    continue
  fi
  
  # If it's a script, find matching test file
  if [[ "$file" == scripts/*.sh ]] || [[ "$file" == scripts/*.mjs ]] || [[ "$file" == scripts/*.js ]] || [[ "$file" == scripts/*.ts ]] || [[ "$file" == scripts/factory/*.ts ]] || [[ "$file" == scripts/factory/*.js ]]; then
    basename=$(basename "$file")
    name="${basename%.*}"
    # Try name.bats and common patterns
    matched_test=""
    if [ -f "$BASE_DIR/$name.bats" ]; then
      matched_test="$BASE_DIR/$name.bats"
    elif [ -f "$BASE_DIR/vda-$name.bats" ]; then
      matched_test="$BASE_DIR/vda-$name.bats"
    elif [ -f "$BASE_DIR/ticket-$name.bats" ]; then
      matched_test="$BASE_DIR/ticket-$name.bats"
    elif [ -f "$BASE_DIR/factory-$name.bats" ]; then
      matched_test="$BASE_DIR/factory-$name.bats"
    fi
    
    if [ -n "$matched_test" ] && ! is_excluded "$matched_test"; then
      CANDIDATES+=("$matched_test")
    elif [ -z "$matched_test" ]; then
      # If a script changed but no obvious test matches, fallback to run all for safety
      RUN_ALL=true
    fi
    continue
  fi

  # If workflow, configs, or test helper libraries changed, run all tests for safety
  if [[ "$file" == .github/workflows/* ]] || [[ "$file" == Taskfile* ]] || [[ "$file" == tests/unit/lib/* ]] || [[ "$file" == package.json ]]; then
    RUN_ALL=true
  fi
done <<< "$CHANGED"

# Unique list of candidates
if [ "$RUN_ALL" = "true" ]; then
  # Return all non-excluded tests in the directory
  find "$BASE_DIR" -maxdepth 1 -name "*.bats" | while read -r test_file; do
    if ! is_excluded "$test_file"; then
      echo "$test_file"
    fi
  done
elif [ ${#CANDIDATES[@]} -gt 0 ]; then
  printf "%s\n" "${CANDIDATES[@]}" | sort -u
fi
