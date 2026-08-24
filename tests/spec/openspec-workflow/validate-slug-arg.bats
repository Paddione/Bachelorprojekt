#!/usr/bin/env bats
# tests/spec/openspec-workflow/validate-slug-arg.bats
# SSOT: openspec/specs/openspec-workflow.md
#   Requirement "Validate ist ein fail-closed CI-Gate für Delta-Dateien"
#
# Ticket: T015825 — openspec.sh validate ignoriert ein übergebenes Slug-Argument
# still und validiert stattdessen alle Changes.
#
# Prüfmodus: Output-Verifikation (T002448-M4) — die Tests führen
# `scripts/openspec.sh validate` gegen eine Sandbox über OPENSPEC_ROOT aus und
# prüfen Exit-Codes sowie die Semantik der Ausgabe (T002716), nicht den Quelltext.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SANDBOX="$(mktemp -d)"
  export OPENSPEC_ROOT="${SANDBOX}/openspec"
}

teardown() {
  rm -rf "$SANDBOX"
}

_make_change() {
  local slug="$1" mode="${2:-ok}"
  mkdir -p "${OPENSPEC_ROOT}/changes/${slug}/specs"
  if [ "$mode" = "broken" ]; then
    # Regelverstoß: H2-'## Requirement:' statt H3 (fail-closed-Kriterium).
    printf '## ADDED Requirements\n\n## Requirement: Kaputt\n' \
      > "${OPENSPEC_ROOT}/changes/${slug}/specs/delta.md"
  else
    printf '## ADDED Requirements\n\n### Requirement: Okay\n\n#### Scenario: S\n\n- **GIVEN** g\n- **WHEN** w\n- **THEN** t\n' \
      > "${OPENSPEC_ROOT}/changes/${slug}/specs/delta.md"
  fi
  echo "T990001" > "${OPENSPEC_ROOT}/changes/${slug}/.ticket"
}

@test "validate <slug> validiert gezielt nur diesen Change" {
  _make_change good
  _make_change broken broken

  run env OPENSPEC_ROOT="$OPENSPEC_ROOT" \
    bash "$REPO_ROOT/scripts/openspec.sh" validate good

  [ "$status" -eq 0 ]
  [[ "$output" == *"good"* ]]
  local complaints
  complaints="$(printf '%s\n' "$output" | grep -F 'broken' || true)"
  [ -z "$complaints" ]
}

@test "unbekanntes Slug-Argument schlägt fail-closed fehl und nennt den Slug" {
  _make_change good

  run env OPENSPEC_ROOT="$OPENSPEC_ROOT" \
    bash "$REPO_ROOT/scripts/openspec.sh" validate does-not-exist

  [ "$status" -ne 0 ]
  [[ "$output" == *"does-not-exist"* ]]
}

@test "Voll-Lauf ohne Argument ist kenntlich gemacht" {
  _make_change good

  run env OPENSPEC_ROOT="$OPENSPEC_ROOT" \
    bash "$REPO_ROOT/scripts/openspec.sh" validate

  [ "$status" -eq 0 ]
  local last
  last="$(printf '%s\n' "$output" | tail -n 1)"
  [[ "$last" == *"all changes"* ]]
}

@test "mehr als ein Positionsargument wird abgewiesen" {
  _make_change good

  run env OPENSPEC_ROOT="$OPENSPEC_ROOT" \
    bash "$REPO_ROOT/scripts/openspec.sh" validate good extra

  [ "$status" -ne 0 ]

  # Positiv-Anker (T002356-M1): derselbe Aufruf mit genau einem Slug läuft durch.
  run env OPENSPEC_ROOT="$OPENSPEC_ROOT" \
    bash "$REPO_ROOT/scripts/openspec.sh" validate good
  [ "$status" -eq 0 ]
}
