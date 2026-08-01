#!/usr/bin/env bats
# tests/spec/mishap-categorize-erden.bats
# T002401 — mishap-categorize erden: bestehende Kategorien als Prompt-Kontext

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$REPO/scripts/mishap-categorize.sh"
}

# ── p2.1: Prompt enthält bestehende Einträge ──────────────────────────────────

@test "T002401: _fetch_existing_categories function exists" {
  [ -f "$SCRIPT" ]
  run grep -q '^_fetch_existing_categories()' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T002401: _build_enum_fallback function exists" {
  [ -f "$SCRIPT" ]
  run grep -q '^_build_enum_fallback()' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T002401: existing categories are fetched before LLM call" {
  [ -f "$SCRIPT" ]
  # The _fetch_existing_categories call must appear BEFORE the DEEPSEEK_API_KEY check
  local cat_line
  cat_line=$(grep -n '_fetch_existing_categories' "$SCRIPT" | head -1 | cut -d: -f1)
  local api_line
  api_line=$(grep -n 'DEEPSEEK_API_KEY' "$SCRIPT" | grep -v '^[[:space:]]*#' | head -1 | cut -d: -f1)
  [ -n "$cat_line" ]
  [ -n "$api_line" ]
  [ "$cat_line" -lt "$api_line" ]
}

@test "T002401: LLM prompt contains [EXISTING_CATEGORIES] block" {
  [ -f "$SCRIPT" ]
  run grep -F '[EXISTING_CATEGORIES]' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T002401: prompt uses dynamic existing_categories variable (not hardcoded list)" {
  [ -f "$SCRIPT" ]
  # The prompt block should contain a while-read loop on $existing_categories
  run grep -F '$(echo "$existing_categories"' "$SCRIPT"
  [ "$status" -eq 0 ]
}

# ── p2.2: DB-Fehler → Enum-Fallback ───────────────────────────────────────────

@test "T002401: enum fallback is used when existing_categories is empty" {
  [ -f "$SCRIPT" ]
  # Check the fallback pattern: if existing_categories is empty, call _build_enum_fallback
  run grep -F 'existing_categories=$(_build_enum_fallback)' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T002401: valid array is built dynamically from existing_categories" {
  [ -f "$SCRIPT" ]
  # The valid array should be built from $existing_categories, not hardcoded
  run grep -F '<<< "$existing_categories"' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T002401: enum fallback includes all canonical categories" {
  [ -f "$SCRIPT" ]
  for cat in 'CI-Konflikt' 'Gate-Fehler' 'API-Fehler' 'Scout-Qualität' 'Deploy-Fehler' 'Spec-Lücke' 'Test-Lücke' 'Sonstige'; do
    run grep -F "'$cat'" "$SCRIPT"
    [ "$status" -eq 0 ] || { echo "Missing enum category: $cat" >&2; false; }
  done
}

@test "T002401: keyword-matching path is unchanged (still exists before LLM fallback)" {
  [ -f "$SCRIPT" ]
  # The keyword matching loop must still exist
  run grep -F 'best_count=0' "$SCRIPT"
  [ "$status" -eq 0 ]
  run grep -F 'keyword match →' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T002401: _db_update still references kind: prefix for tag insertion" {
  [ -f "$SCRIPT" ]
  run grep -F "'kind:'" "$SCRIPT"
  [ "$status" -eq 0 ]
}
