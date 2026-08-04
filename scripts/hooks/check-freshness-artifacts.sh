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

# Artefakte, die bei einer .bats-Änderung mitgepflegt werden müssen. Beide
# werden EINZELN geprüft — genau das war der Fehler in der Vorgängerfassung.
ARTIFACTS=(
  "docs/code-quality/repo-index.json"
  "website/src/data/test-inventory.json"
)

changed="$(git diff --name-only "${BASE}..${HEAD_SHA}" 2>/dev/null)"

# Ohne .bats-Änderung gibt es nichts zu melden.
printf '%s\n' "$changed" | grep -q '\.bats$' || exit 0

rc=0
for artifact in "${ARTIFACTS[@]}"; do
  if ! printf '%s\n' "$changed" | grep -qxF "$artifact"; then
    printf '%s\n' "$artifact"
    rc=1
  fi
done

exit "$rc"
