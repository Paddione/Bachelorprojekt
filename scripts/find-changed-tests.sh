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
# [T002377] Warum RUN_ALL griff — der Fallback war bisher stumm. Wer die Ausgabe
# sah, las "Running changed spec tests:" gefolgt von 138 Pfaden und hielt das fuer
# eine gezielte Auswahl statt fuer "ich fuehre die komplette Suite aus". Der
# resultierende Lauf dauert ueber zehn Minuten; laeuft er in ein Timeout, endet er
# mit Exit != 0, waehrend JEDER Untertest bestanden hat - gemeldet als
# "false-positive exit 1".
RUN_ALL_REASON=""

_trigger_run_all() {   # $1 = die Datei, die den Fallback ausgeloest hat
  RUN_ALL=true
  [ -n "$RUN_ALL_REASON" ] && return 0
  RUN_ALL_REASON="$1"
  echo "note: '$1' changed — falling back to the FULL ${TYPE} suite (no diff-scoped selection)" >&2
}
declare -A PROBE_CACHE=()  # path-prefix → matching spec bats (grep memoisation)

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
    if [ -f "$file" ] && ! is_excluded "$file"; then
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
    # Strip -check suffix: health-goals-check.sh → health-goals.bats
    elif [[ "$name" == *-check ]] && [ -f "$BASE_DIR/${name%-check}.bats" ]; then
      matched_test="$BASE_DIR/${name%-check}.bats"
    fi
    
    if [ -n "$matched_test" ] && ! is_excluded "$matched_test"; then
      CANDIDATES+=("$matched_test")
    elif [ -z "$matched_test" ]; then
      # If the test-finder itself changed, don't trigger RUN_ALL — the
      # selection logic IS the change being tested.
      if [[ "$file" == scripts/find-changed-tests.sh ]]; then
        echo "note: $file changed — no test file match, skipping RUN_ALL" >&2
      else
        # If a script changed but no obvious test matches, fallback to run all for safety
        _trigger_run_all "$file"
      fi
    fi
    continue
  fi

  # tests/spec/*.bats are named after their OpenSpec SSOT spec slug, so an
  # openspec/ change maps straight onto the same-named spec bats. [T002245]
  if [ "$TYPE" = "spec" ] && [[ "$file" == openspec/* ]]; then
    slug=$(printf '%s\n' "$file" | cut -d/ -f3)
    if [ -n "$slug" ] && [ -f "$BASE_DIR/$slug.bats" ]; then
      CANDIDATES+=("$BASE_DIR/$slug.bats")
    fi
    continue
  fi

  # Shared spec harness (helpers/fixtures) can break any spec file. [T002245]
  if [ "$TYPE" = "spec" ] && { [[ "$file" == tests/spec/helpers/* ]] || [[ "$file" == tests/spec/fixtures/* ]] || [[ "$file" == tests/spec/test_helper.bash ]]; }; then
    _trigger_run_all "$file"
    continue
  fi

  # If workflow, configs, or test helper libraries changed, run all tests for safety
  if [[ "$file" == .github/workflows/* ]] || [[ "$file" == Taskfile* ]] || [[ "$file" == tests/unit/lib/* ]] || [[ "$file" == package.json ]]; then
    _trigger_run_all "$file"
    continue
  fi

  # Last resort for spec selection: a spec bats that mentions the changed path
  # is the one asserting about it. Probes the full path first, then walks up the
  # ancestor directories, deepest match wins — so website/src/pages/admin/x.astro
  # picks the admin specs rather than every spec that mentions website/src.
  # Floors above the top-level segment (never probes a bare "website"). Without
  # this, whole domains (website/**, k3d/**, flux/**) matched no rule above and
  # a diff-scoped run selected nothing for them. [T002245]
  if [ "$TYPE" = "spec" ] && [ "$RUN_ALL" != "true" ]; then
    probe="$file"
    matched=""
    while [[ "$probe" == */* ]]; do
      if [ -n "${PROBE_CACHE[$probe]+set}" ]; then
        matched="${PROBE_CACHE[$probe]}"
      else
        matched=$(grep -lF -- "$probe" "$BASE_DIR"/*.bats 2>/dev/null || true)
        PROBE_CACHE["$probe"]="$matched"
      fi
      [ -n "$matched" ] && break
      probe="${probe%/*}"
    done
    while IFS= read -r m; do
      [ -n "$m" ] && CANDIDATES+=("$m")
    done <<< "$matched"
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
