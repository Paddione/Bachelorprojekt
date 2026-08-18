#!/usr/bin/env bats
#
# T012488 — Self-hosted Kapazitaet wird ausschliesslich ueber Capability-Labels
# adressiert, nie ueber den generischen Pool.
#
# Pruefmodus: command output verification. Der Guard wird gegen Fixtures in
# $BATS_TEST_TMPDIR AUSGEFUEHRT und sein Exit-Code plus seine Ausgabe geprueft —
# nicht sein Quelltext. Der entscheidende Nachweis ist, dass der Guard einen
# Verstoss FINDET; ein Guard, der nur den bereits korrekten Repo-Zustand
# bestaetigt, waere von Anfang an gruen und bewiese nichts.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GUARD="$REPO/scripts/ci/runner-placement-check.sh"
  FIX="$BATS_TEST_TMPDIR/workflows"
  mkdir -p "$FIX"
}

# Schreibt eine minimale, valide Workflow-Datei mit vorgegebenem runs-on.
_fixture() {
  local file="$1" job="$2" runson="$3"
  {
    echo "name: Fixture"
    echo "on: [push]"
    echo "jobs:"
    echo "  $job:"
    echo "    runs-on: $runson"
    echo "    steps:"
    echo "      - run: echo hi"
  } > "$FIX/$file"
}

@test "T012488: generischer self-hosted Pool wird abgelehnt, Datei und Job benannt" {
  _fixture generic.yml build-thing '[self-hosted, linux, x64]'
  run bash "$GUARD" "$FIX"
  [ "$status" -ne 0 ]
  [[ "$output" == *"generic.yml"* ]]
  [[ "$output" == *"build-thing"* ]]
}

@test "T012488: unbekanntes Capability-Label wird benannt" {
  _fixture unknown.yml gpu-thing '[self-hosted, quantum-annealer]'
  run bash "$GUARD" "$FIX"
  [ "$status" -ne 0 ]
  [[ "$output" == *"quantum-annealer"* ]]
}

@test "T012488: neu hinzugefuegter Job wird ohne gepflegte Jobliste erfasst" {
  # Positiv-Anker zuerst: eine Fixture, die nur zulaessige Jobs enthaelt, besteht.
  _fixture clean.yml portable-job 'ubuntu-latest'
  run bash "$GUARD" "$FIX"
  [ "$status" -eq 0 ]

  # Derselben Datei einen bisher unbekannten Job hinzufuegen — der Guard iteriert
  # ueber alle Jobs, statt bekannte Namen abzuhaken, und muss ihn finden.
  {
    echo "  brand-new-job:"
    echo "    runs-on: [self-hosted, linux, x64]"
    echo "    steps:"
    echo "      - run: echo hi"
  } >> "$FIX/clean.yml"

  run bash "$GUARD" "$FIX"
  [ "$status" -ne 0 ]
  [[ "$output" == *"brand-new-job"* ]]
}

@test "T012488: nicht auswertbarer runs-on-Ausdruck wird abgelehnt statt still bestanden" {
  _fixture expr.yml dynamic-job '${{ matrix.runner }}'
  run bash "$GUARD" "$FIX"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dynamic-job"* ]]
}

@test "T012488: deklariertes Capability-Label besteht" {
  _fixture gpu.yml gpu-job '[self-hosted, fleet-gpu]'
  run bash "$GUARD" "$FIX"
  [ "$status" -eq 0 ]
}

@test "T012488: reales .github/workflows besteht den Guard" {
  run bash "$GUARD" "$REPO/.github/workflows"
  [ "$status" -eq 0 ]
}

@test "T012488: Positivanker — arbitration und opencode adressieren fleet-gpu" {
  # Ohne diesen Anker koennte ein Guard, der jede self-hosted Nutzung ablehnt,
  # gruen erscheinen, obwohl die zulaessige Platzierung verschwunden ist.
  local f runner
  for f in arbitration opencode; do
    runner="$(yq -r '.jobs.*."runs-on" | tostring' "$REPO/.github/workflows/$f.yml")"
    [[ "$runner" == *"self-hosted"* ]] || { echo "$f.yml: kein self-hosted mehr -> $runner" >&2; return 1; }
    [[ "$runner" == *"fleet-gpu"* ]]  || { echo "$f.yml: kein fleet-gpu mehr -> $runner" >&2; return 1; }
  done
}
