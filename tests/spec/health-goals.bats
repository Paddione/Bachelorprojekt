#!/usr/bin/env bats
# SSOT: openspec/changes/t001358-sec05-health-goals/tasks.md
# G-SEC05: health-goals-check.sh muss BEIDE github-actions[bot]-Mail-Varianten
# aus der "unsignierte Commits"-Zaehlung ausschliessen — mit und ohne den
# numerischen 41898282+-Praefix.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/health-goals-check.sh"
}

# Extract the exact grep -vE filter expression used for G-SEC05 so the test
# fails (red) against the pre-fix single-variant pattern and passes (green)
# once both bot-email variants are excluded.
g_sec05_filter() {
  grep -oE "grep -vE? '[^']*github-actions[^']*'" "$SCRIPT" | head -1
}

@test "G-SEC05: filters the numeric-prefixed bot email variant" {
  filter_cmd=$(g_sec05_filter)
  [ -n "$filter_cmd" ]
  run bash -c "printf '%s\n' 'N 41898282+github-actions[bot]@users.noreply.github.com' | $filter_cmd"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "G-SEC05: filters the non-prefixed bot email variant" {
  filter_cmd=$(g_sec05_filter)
  [ -n "$filter_cmd" ]
  run bash -c "printf '%s\n' 'N github-actions[bot]@users.noreply.github.com' | $filter_cmd"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "G-SEC05: does not filter unrelated unsigned commit authors" {
  filter_cmd=$(g_sec05_filter)
  [ -n "$filter_cmd" ]
  run bash -c "printf '%s\n' 'N somebody@example.com' | $filter_cmd"
  [ "$status" -eq 0 ]
  [ "$output" = "N somebody@example.com" ]
}
