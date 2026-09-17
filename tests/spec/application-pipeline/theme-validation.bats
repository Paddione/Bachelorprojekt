#!/usr/bin/env bats
# tests/spec/application-pipeline/theme-validation.bats
# BATS-Test für die Theme-Registry und Validierung (Phase 3, T900230).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  _THEMES_SH="${REPO_ROOT}/scripts/lib/application-pipeline-themes.sh"

  source "$_THEMES_SH"
}

# --- Theme existiert: default ---

@test "T900230: app_pipeline_resolve_theme default returns correct path" {
  local output
  output=$(app_pipeline_resolve_theme default)
  [ -n "$output" ]
  [[ "$output" == *"/templates/application-pipeline/themes/default.typ" ]]
}

# --- Theme existiert: accent-slate ---

@test "T900230: app_pipeline_resolve_theme accent-slate returns correct path" {
  local output
  output=$(app_pipeline_resolve_theme accent-slate)
  [ -n "$output" ]
  [[ "$output" == *"/templates/application-pipeline/themes/accent-slate.typ" ]]
}

# --- Ungültiges Theme → Exit 1 mit Fehlermeldung ---

@test "T900230: invalid theme name is rejected with exit code 1" {
  local output
  local exit_code=0
  output=$(app_pipeline_resolve_theme "nicht-existent" 2>&1) || exit_code=$?

  [ "$exit_code" -ne 0 ]
  echo "$output" | grep -q "unknown theme"
  echo "$output" | grep -q "default"
  echo "$output" | grep -q "accent-slate"
}

# --- Leerer Theme-Name → Exit 1 ---

@test "T900230: empty theme name returns error" {
  local output
  local exit_code=0
  output=$(app_pipeline_resolve_theme "" 2>&1) || exit_code=$?

  [ "$exit_code" -ne 0 ]
  echo "$output" | grep -q "required"
}

# --- Theme-Liste ---

@test "T900230: app_pipeline_list_themes lists all available themes" {
  local output
  output=$(app_pipeline_list_themes)

  echo "$output" | grep -q "default"
  echo "$output" | grep -q "accent-slate"
}

# --- Theme-Dateien sind vorhanden ---

@test "T900230: default.typ exists and is non-empty" {
  local repo_root
  repo_root="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  local theme_file="${repo_root}/templates/application-pipeline/themes/default.typ"
  [ -f "$theme_file" ]
  [ -s "$theme_file" ]
}

@test "T900230: accent-slate.typ exists and is non-empty" {
  local repo_root
  repo_root="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  local theme_file="${repo_root}/templates/application-pipeline/themes/accent-slate.typ"
  [ -f "$theme_file" ]
  [ -s "$theme_file" ]
}

# --- Zwei Themes sind unterscheidbar ---

@test "T900230: two themes have different color definitions" {
  local repo_root
  repo_root="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"

  local color1 color2
  color1=$(grep 'color-primary' "${repo_root}/templates/application-pipeline/themes/default.typ" | head -1)
  color2=$(grep 'color-primary' "${repo_root}/templates/application-pipeline/themes/accent-slate.typ" | head -1)

  [ "$color1" != "$color2" ]
}
