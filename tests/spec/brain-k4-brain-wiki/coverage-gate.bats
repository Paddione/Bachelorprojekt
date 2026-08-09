#!/usr/bin/env bats
# tests/spec/brain-k4-brain-wiki/coverage-gate.bats
# Ticket: T002679
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Pruefmodus: Output-Verifikation — fuehrt brain-ingest-coverage.sh gegen
#   vorbereitete TSV-Dateien aus und prueft Exit-Code und Meldungen.
# Positiv-Anker-Pflicht (T002356-M1): jeder Negativtest prueft IM SELBEN
# @test zuerst den gueltigen Fall.

setup() {
  COVERAGE_SCRIPT="scripts/brain-ingest-coverage.sh"
  WORKLIST="$BATS_TEST_TMPDIR/worklist.tsv"
  DELIVERED="$BATS_TEST_TMPDIR/delivered.tsv"
  # Use the test tmpdir as root so path resolution works
  ROOT="$BATS_TEST_TMPDIR"
}

# Helper: create fixture sources and TSV files
# $1 = total source chars, $2 = delivered chars → coverage = $2/$1 * 100
create_fixtures() {
  local total_chars="$1" delivered_chars="$2"
  local src_path="test/fixture-doc.md"
  local src_file="$ROOT/$src_path"

  mkdir -p "$(dirname "$src_file")"

  # Worklist: src_path \t slug \t group
  printf '%s\t%s\t%s\n' "$src_path" "fixture-doc" "test-group" > "$WORKLIST"

  # Create the source file with exactly total_chars bytes
  # Use a repeated 100-byte pattern to make counting precise
  local pattern="0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"
  local repeats=$((total_chars / 100))
  local remainder=$((total_chars % 100))
  for _ in $(seq 1 "$repeats"); do
    printf '%s' "$pattern" >> "$src_file"
  done
  if [ "$remainder" -gt 0 ]; then
    printf '%s' "${pattern:0:$remainder}" >> "$src_file"
  fi

  # Delivered TSV: src_path \t chars \t rc
  printf '%s\t%s\t%s\n' "$src_path" "$delivered_chars" "0" > "$DELIVERED"
}

@test "coverage above the threshold passes and reports the percentage" {
  create_fixtures 10000 9800  # 98% coverage
  export BRAIN_MIN_COVERAGE_PCT=95

  run bash "$COVERAGE_SCRIPT" --worklist "$WORKLIST" --root "$ROOT" --delivered "$DELIVERED"
  [ "$status" -eq 0 ]

  # Output line should mention coverage and contain a number >= 95
  local cov_line
  cov_line="$(printf '%s\n' "$output" | grep -i 'coverage')"
  local pct
  pct="$(echo "$cov_line" | grep -oE '[0-9]+' | head -1)"
  [ "$pct" -ge 95 ]
}

@test "coverage below the threshold fails closed and names both numbers" {
  # Positiv-Anker: first show it passes with sufficient coverage
  create_fixtures 10000 9800
  export BRAIN_MIN_COVERAGE_PCT=95
  run bash "$COVERAGE_SCRIPT" --worklist "$WORKLIST" --root "$ROOT" --delivered "$DELIVERED"
  [ "$status" -eq 0 ]

  # Now test with low coverage (~17%)
  create_fixtures 10000 1700
  run bash "$COVERAGE_SCRIPT" --worklist "$WORKLIST" --root "$ROOT" --delivered "$DELIVERED"
  [ "$status" -ne 0 ]

  # The error message should mention both the measured percentage and the threshold
  local err_output
  err_output="$(printf '%s\n' "$output" | grep -i 'coverage')"
  echo "$err_output" | grep -qE '[0-9]+%' || {
    echo "Error does not contain percentage: $err_output" >&2
    false
  }
  echo "$err_output" | grep -qE '95' || {
    echo "Error does not mention threshold 95: $err_output" >&2
    false
  }
}

@test "threshold is configurable via BRAIN_MIN_COVERAGE_PCT" {
  # ~50% coverage
  create_fixtures 10000 5000

  # With threshold 40%: should pass
  export BRAIN_MIN_COVERAGE_PCT=40
  run bash "$COVERAGE_SCRIPT" --worklist "$WORKLIST" --root "$ROOT" --delivered "$DELIVERED"
  local pass_rc=$status

  # With threshold 60%: should fail
  export BRAIN_MIN_COVERAGE_PCT=60
  run bash "$COVERAGE_SCRIPT" --worklist "$WORKLIST" --root "$ROOT" --delivered "$DELIVERED"
  local fail_rc=$status

  # Exit codes must differ
  [ "$pass_rc" -ne "$fail_rc" ] || {
    echo "Both thresholds returned same exit code ($pass_rc) — threshold not configurable" >&2
    false
  }

  # Pass should be 0
  [ "$pass_rc" -eq 0 ]
}
