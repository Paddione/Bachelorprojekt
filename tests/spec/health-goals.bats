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

# --- T001953: unbounded network calls (G-SEC06 / G-FE05) must be timeout-wrapped ---
# Mishap: health-goals-check.sh hung indefinitely after printing its header
# because the G-FE05 (Lighthouse via npx @lhci/cli, hits a live URL) and
# G-SEC06 (trivy image scan piped from `kubectl get pods`) checks had no
# `timeout` guard, unlike every other kubectl call in this script which
# uses --request-timeout. Regression-guard: both call sites must be wrapped
# in `timeout <n>` so a slow/unreachable network dependency can never hang
# the whole report.

@test "G-FE05: the Lighthouse npx call is wrapped in a timeout" {
  run grep -E 'score=\$\(timeout [0-9]+ npx @lhci/cli autorun' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "G-SEC06: the trivy image scan and its kubectl pod list are wrapped in a timeout" {
  run grep -E 'timeout [0-9]+ trivy image' "$SCRIPT"
  [ "$status" -eq 0 ]
  run grep -E 'timeout [0-9]+ kubectl get pods --all-namespaces' "$SCRIPT"
  [ "$status" -eq 0 ]
}

# --- T001884: gen-goals-data.mjs (E4) ---

setup_gen() {
  GEN="$REPO_ROOT/scripts/gen-goals-data.mjs"
  WORK="$(mktemp -d)"
}
teardown_gen() { rm -rf "$WORK"; }

@test "gen-goals-data.mjs parses an H2-section Prio-A goal into the HealthGoal shape" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-TEST01 — Beispielziel: 7 (Ziel <= 6)

```bash
echo 7
```

> **A · Baseline:** 6 → 7 · **Target:** ≤ 6 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · Ticket: T000001
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  run jq -r '.[0].id' "$WORK/out.json"
  [ "$output" = "G-TEST01" ]
  [ "$(jq -r '.[0].baseline' "$WORK/out.json")" = "6" ]
  [ "$(jq -r '.[0].current' "$WORK/out.json")" = "7" ]
  [ "$(jq -r '.[0].target' "$WORK/out.json")" = "6" ]
  [ "$(jq -r '.[0].direction' "$WORK/out.json")" = "lower" ]
  [ "$(jq -r '.[0].source' "$WORK/out.json")" = ".claude/lib/goals.md · G-TEST01" ]
}

@test "gen-goals-data.mjs fails loud on an H2 goal with no meta-line" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-BROKEN01 — Kaputtes Ziel ohne Meta-Zeile

Nur Prosa, keine Meta-Zeile.
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -ne 0 ] || { echo "FAIL: should fail loud on missing meta-line"; return 1; }
  [[ "$output" == *"G-BROKEN01"* ]] || { echo "FAIL: error should name the offending id"; return 1; }
}

@test "gen-goals-data.mjs parses a Prio-C table row" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE01** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  [ "$(jq -r '.[0].id' "$WORK/out.json")" = "G-TABLE01" ]
  [ "$(jq -r '.[0].priority' "$WORK/out.json")" = "C" ]
  [ "$(jq -r '.[0].baseline' "$WORK/out.json")" = "null" ]
  [ "$(jq -r '.[0].current' "$WORK/out.json")" = "0" ]
}

@test "gen-goals-data.mjs keeps a markdown-escaped pipe inside a Prio-C measurement cell intact" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE02** | Beispiel-Gate mit Pipe | 0 ✓ | 0 | `git log --oneline \| wc -l` |
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  [ "$(jq -r '.[0].id' "$WORK/out.json")" = "G-TABLE02" ]
  measurement="$(jq -r '.[0].measurement' "$WORK/out.json")"
  [[ "$measurement" == "git log --oneline | wc -l" ]] || { echo "FAIL: measurement truncated/mangled: '$measurement'"; return 1; }
}
