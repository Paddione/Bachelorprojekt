#!/usr/bin/env bats
# tests/spec/repo-health-goals.bats
# SSOT: openspec/specs/t001358-sec05-health-goals.md
# Covers: Open-Goals Report with Ticket Suggestion (health-goals-update.sh).

SCRIPT="scripts/health-goals-update.sh"

setup() {
  REPO_ROOT="$(git rev-parse --show-toplevel)"
  cd "$REPO_ROOT"
  TMP="$(mktemp -d)"
  GOALS="$TMP/goals.md"
  VALUES="$TMP/values.txt"
}

teardown() {
  rm -rf "$TMP"
}

# Fixture with one open (⚠) row and one green (✓) row.
_write_mixed_fixture() {
  cat > "$GOALS" <<'MD'
| **ID** | Ziel | Aktuell | Target | Basis-Messung |
|--------|------|---------|--------|---------------|
| **G-AGENTIC17** | Command-Orphans via S4 | 3 ⚠ | ≤ 0 | `echo 3` |
| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |
MD
  cat > "$VALUES" <<'VAL'
G-AGENTIC17 3 le 0
G-RH01 26 le 30
VAL
}

# Fixture with only green rows.
_write_green_fixture() {
  cat > "$GOALS" <<'MD'
| **ID** | Ziel | Aktuell | Target | Basis-Messung |
|--------|------|---------|--------|---------------|
| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |
MD
  cat > "$VALUES" <<'VAL'
G-RH01 26 le 30
VAL
}

@test "unchanged open goal is listed" {
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Offene Ziele (Target verfehlt):"* ]]
  [[ "$output" == *"G-AGENTIC17"* ]]
  [[ "$output" == *"Target: <= 0"* ]]
}

@test "ticket command is well-formed" {
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run --suggest-tickets
  [ "$status" -eq 0 ]
  [[ "$output" == *"scripts/ticket.sh create"* ]]
  # exactly one of each required flag in the suggestion
  [ "$(grep -c -- '--type' <<<"$output")" -eq 1 ]
  [ "$(grep -c -- '--title' <<<"$output")" -eq 1 ]
  [ "$(grep -c -- '--description' <<<"$output")" -eq 1 ]
  [ "$(grep -c -- '--priority' <<<"$output")" -eq 1 ]
  [[ "$output" == *'--title "Health-Goal: G-AGENTIC17'* ]]
}

@test "no open goals prints the empty line" {
  _write_green_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"keine — alle Prio-C-Gates grün."* ]]
  [[ "$output" != *"scripts/ticket.sh create"* ]]
}

@test "special chars in goal text are shell-escaped in the suggestion" {
  cat > "$GOALS" <<'MD'
| **ID** | Ziel | Aktuell | Target | Basis-Messung |
|--------|------|---------|--------|---------------|
| **G-ESC01** | Budget $5 "quoted" backtick ` check | 3 ⚠ | ≤ 0 | `echo 3` |
MD
  cat > "$VALUES" <<'VAL'
G-ESC01 3 le 0
VAL
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run --suggest-tickets
  [ "$status" -eq 0 ]
  # $, ", and ` must all be backslash-escaped so the suggestion is safe to
  # paste into a double-quoted shell string without triggering substitution.
  [[ "$output" == *'\$5'* ]]
  [[ "$output" == *'\"quoted\"'* ]]
  [[ "$output" == *'\`'* ]]
}

@test "report block is identical under dry-run" {
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run
  dry="$(sed -n '/Offene Ziele/,$p' <<<"$output")"
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT"
  normal="$(sed -n '/Offene Ziele/,$p' <<<"$output")"
  [ "$dry" = "$normal" ]
}
