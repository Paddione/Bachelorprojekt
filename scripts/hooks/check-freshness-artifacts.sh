#!/usr/bin/env bash
# scripts/hooks/check-freshness-artifacts.sh [T002672]
#
# Listet die generierten Artefakte, die in einem Commit-Bereich FEHLEN, obwohl
# darin `.bats`-Dateien geändert wurden. Eine Zeile pro fehlendem Pfad auf
# stdout; Exit 1 wenn die Liste nicht leer ist, sonst Exit 0.
#
#   check-freshness-artifacts.sh <base-ref> <head-sha>
#
# Warum als eigenes Skript und nicht inline in .githooks/pre-push: der Hook ist
# praktisch nicht testbar — er steigt bei fehlendem node_modules/.bin/madge
# sofort mit exit 0 aus, ruft `task` auf und macht seine Warnung davon abhängig,
# dass `freshness:regenerate` im echten Repo einen Diff erzeugt. Diese Prüfung
# ist dagegen eine reine Funktion von (Commit-Bereich) auf (fehlende Pfade) und
# damit gegen ein temporäres Git-Repo verifizierbar.
# Guard: tests/spec/ci-cd/pre-push-artifact-guard.bats
#
# Vorgeschichte: der Hook ermittelte die Lage mit EINEM ODER-grep über beide
# Dateinamen und übersprang den Warnblock, sobald eine der beiden im Push lag —
# auch wenn die andere fehlte. Bei PR #3794 war test-inventory.json dabei,
# repo-index.json nicht; der Hook schwieg und CI fiel darüber. Wer eines der
# Artefakte pflegte, schaltete damit die Prüfung für das andere ab.
set -uo pipefail

BASE="${1:-}"
HEAD_SHA="${2:-}"

if [[ -z "$BASE" || -z "$HEAD_SHA" ]]; then
  echo "usage: check-freshness-artifacts.sh <base-ref> <head-sha>" >&2
  exit 2
fi

# [T002686] Der Ausloeser war eine gemeinsame `.bats`-Bedingung fuer beide
# Artefakte. Das war fuer repo-index.json zu eng: es zaehlt ALLE getrackten
# Dateien (scan.mjs -> git ls-files), wird also von jeder hinzugefuegten oder
# entfernten Datei stale — unabhaengig vom Typ. Dreimal an einem Tag lief CI
# genau darauf: T002681 und T002684 (je eine .test.ts, der Hook schwieg) sowie
# T002674 (.bats, der Hook warnte). Jedes Artefakt bekommt deshalb seine eigene
# Bedingung.
#
# test-inventory.json speist sich aus *.bats und *.sh unter tests/ sowie
# tests/e2e/specs/*.spec.ts (build-test-inventory.sh). Hier zaehlt auch eine
# reine Aenderung, weil @test-Namen die Inventar-IDs bilden.

changed="$(git diff --name-only "${BASE}..${HEAD_SHA}" 2>/dev/null)"
# Nur Hinzufuegen/Loeschen aendert die Dateimenge, die repo-index.json zaehlt.
added_deleted="$(git diff --name-only --diff-filter=AD "${BASE}..${HEAD_SHA}" 2>/dev/null)"

_needs_repo_index() {
  [[ -n "$added_deleted" ]]
}

_needs_test_inventory() {
  printf '%s\n' "$changed" | grep -qE '\.bats$|^tests/.*\.sh$|^tests/e2e/specs/.*\.spec\.ts$'
}

rc=0
_require() {
  local artifact="$1"
  if ! printf '%s\n' "$changed" | grep -qxF "$artifact"; then
    printf '%s\n' "$artifact"
    rc=1
  fi
}

# Beide werden EINZELN geprueft — ein gemeinsamer ODER-grep war der Fehler der
# Vorgaengerfassung (siehe Vorgeschichte oben).
_needs_repo_index     && _require "docs/code-quality/repo-index.json"
_needs_test_inventory && _require "website/src/data/test-inventory.json"

exit "$rc"
