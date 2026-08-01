#!/usr/bin/env bash
# Resolves BATS files matching changed files.
# Usage: bash scripts/find-changed-tests.sh [unit|spec]

set -euo pipefail

TYPE="${1:-unit}" # "unit" or "spec"
BASE_DIR="tests/${TYPE}"
ALLOWLIST="tests/unit/.coverage-allowlist"

# Get the list of changed files against main.
# FIND_CHANGED_TESTS_FILES ueberschreibt die Liste (newline-separiert). Das ist
# die Test-Naht: der RUN_ALL-Zweig haengt sonst an einem committeten Diff gegen
# origin/main und laesst sich nicht gezielt ausloesen — ein Test muesste die
# Sammel-Logik nachbauen und wuerde damit seine eigene Kopie pruefen statt
# dieses Skript. [T002518]
CHANGED="${FIND_CHANGED_TESTS_FILES:-$(git diff --name-only HEAD origin/main 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)}"

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

# Probe spec bats files for a given path: grep the path into spec bats, walk
# ancestor directories, deepest match wins. Extracted so both the main loop
# and the scripts/* fallback can share it without duplication. [T002345]
probe_spec_for_path() { # $1 = changed file path
  local probe="$1" matched=""
  while [[ "$probe" == */* ]]; do
    if [ -n "${PROBE_CACHE[$probe]+set}" ]; then
      matched="${PROBE_CACHE[$probe]}"
    else
      # Rekursiv statt flachem Glob [T002416]: seit der Verzeichniskonvention liegen
      # Tests auch unter tests/spec/<spec-slug>/. Ein flaches "$BASE_DIR"/*.bats haette
      # sie uebersehen — die Aenderung an einem Skript wuerde dann ihren eigenen Test
      # nicht mehr ausloesen, und der Lauf saehe gruen aus, weil er gar nicht stattfand.
      matched=$(find "$BASE_DIR" -name '*.bats' -type f -exec grep -lF -- "$probe" {} + 2>/dev/null || true)
      PROBE_CACHE["$probe"]="$matched"
    fi
    [ -n "$matched" ] && break
    probe="${probe%/*}"
  done
  while IFS= read -r m; do
    [ -n "$m" ] && CANDIDATES+=("$m")
  done <<< "$matched" || true
}

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
    # Verzeichnisform [T002416]: tests/spec/<spec-slug>/<name>.bats. Erst nach der
    # flachen Form geprueft, damit bestehende Sammeldateien Vorrang behalten und die
    # Auswahl sich fuer sie nicht aendert.
    elif _dir_match="$(find "$BASE_DIR" -mindepth 2 -name "$name.bats" -type f 2>/dev/null | head -1)"; [ -n "$_dir_match" ]; then
      matched_test="$_dir_match"
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
      elif [ "$TYPE" = "spec" ]; then
        # For spec selection, try the path probe before falling back to RUN_ALL.
        # The probe greps the changed path into spec bats and picks the deepest
        # match — often finding exactly the one suite that covers this script.
        # Without this, every scripts/* change without a name match would fall
        # through to RUN_ALL, pulling in the entire spec suite. [T002345]
        probe_spec_for_path "$file"
        if [ ${#CANDIDATES[@]} -eq 0 ]; then
          _trigger_run_all "$file"
        fi
      else
        # For unit selection, fallback to run all for safety
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
    probe_spec_for_path "$file"
  fi
done <<< "$CHANGED"

# Unique list of candidates
if [ "$RUN_ALL" = "true" ]; then
  # Der Fallback MUSS dieselbe Menge liefern wie der jeweilige Runner-Task,
  # sonst laufen Tests nur auf einem der beiden Wege. Die beiden Sammlungen
  # haben bewusst GEGENSAETZLICHE Konventionen:
  #
  #   spec  → rekursiv (`task test:spec` nutzt `bats -r tests/spec/`, T002416:
  #           eine Datei pro Vorgang unter tests/spec/<spec-slug>/)
  #   unit  → flach (`task test:unit` nutzt `find … -maxdepth 1`), denn unter
  #           tests/unit/lib/ liegt die VENDORTE bats-core-Installation mit
  #           eigenen .bats-Beispieldateien, die nie laufen duerfen.
  #
  # Vorher galt `-maxdepth 1` fuer beide. Da JEDER PR ueber diesen Pfad laeuft
  # (test:spec:changed), fielen damit alle 65 Spec-Tests in Unterverzeichnissen
  # aus der PR-Abdeckung — u. a. die kompletten Verzeichnisse
  # tests/spec/software-factory/ und tests/spec/sdlc-cockpit/. Nur der
  # Push-nach-main-Pfad erfasste sie. [T002518]
  if [ "$TYPE" = "spec" ]; then
    _find_args=(-name "*.bats")
  else
    _find_args=(-maxdepth 1 -name "*.bats")
  fi
  find "$BASE_DIR" "${_find_args[@]}" | while read -r test_file; do
    if ! is_excluded "$test_file"; then
      echo "$test_file"
    fi
  done
elif [ ${#CANDIDATES[@]} -gt 0 ]; then
  printf "%s\n" "${CANDIDATES[@]}" | sort -u
fi
