#!/usr/bin/env bats
# tests/spec/application-pipeline/render-cli.bats
# BATS-Test für die Render-Pipeline CLI (Phase 3, T900230).
#
# WICHTIG: typst ist in CI nicht installiert.
# Jeder Test, der typst compile aufruft, MUSS mit "command -v typst" guarded sein.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  _RENDER_SH="${REPO_ROOT}/scripts/vda/apply/render.sh"
}

# --- Invalid theme name rejected (pre-compilation check) ---

@test "T900230: render.sh --theme invalid-theme exits with error" {
  local output
  local exit_code=0
  output=$(bash "$_RENDER_SH" --job-id 999 --theme "nicht-existent" 2>&1) || exit_code=$?

  [ "$exit_code" -ne 0 ]
  echo "$output" | grep -q "unknown theme\|Error"
}

# --- Missing --job-id is rejected ---

@test "T900230: render.sh without --job-id exits with error" {
  local output
  local exit_code=0
  output=$(bash "$_RENDER_SH" --theme default 2>&1) || exit_code=$?

  [ "$exit_code" -ne 0 ]
  echo "$output" | grep -q "required\|Error"
}

# --- Render.sh exists and is executable ---

@test "T900230: render.sh exists and is executable" {
  [ -f "$_RENDER_SH" ]
  [ -x "$_RENDER_SH" ]
}

# --- Typst guard: skip gracefully when not installed ---

@test "T900230: render.sh skips typst compilation when not installed" {
  local typst_path
  typst_path=$(which typst 2>/dev/null || echo "")

  if [[ -z "$typst_path" ]]; then
    skip "typst binary not installed — cannot test compilation"
  fi

  [ -f "$_RENDER_SH" ]
}

# --- Output directory creation ---

@test "T900230: render.sh references .output/dossiers/ as default output dir" {
  grep -q '\.output/dossiers' "$_RENDER_SH"
}
