#!/usr/bin/env bats
# tests/spec/ci-cd/changed-tests-collection-parity.bats
# T002518 — Der RUN_ALL-Fallback von find-changed-tests.sh muss dieselbe
# Dateimenge liefern wie der zugehoerige Runner-Task.
#
# Prüfmodus [T002448-M4]: Resultat-Verifikation. Das Skript wird AUSGEFUEHRT und
# seine tatsaechliche Ausgabe gegen die Dateimenge des Runners gezaehlt.
# RUN_ALL wird ueber FIND_CHANGED_TESTS_FILES ausgeloest — ein geaenderter
# Workflow-Pfad ist genau der Fall, der im Skript den Fallback triggert.
#
# Bewusst KEIN Nachbau der Sammel-Logik im Test: eine Kopie bliebe korrekt,
# waehrend das Skript driftet. Und bewusst kein Source-Grep auf "-maxdepth" —
# der urspruengliche Defekt war nicht, DASS die Option dastand, sondern dass sie
# fuer beide Typen galt. Ein Grep haette ihn nicht gefunden.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  cd "$REPO" || return 1
  SCRIPT="scripts/find-changed-tests.sh"
  # Ein Workflow-Pfad triggert im Skript _trigger_run_all.
  export FIND_CHANGED_TESTS_FILES=".github/workflows/ci.yml"
}

teardown() { unset FIND_CHANGED_TESTS_FILES; }

@test "T002518: der spec-Fallback sammelt rekursiv wie 'bats -r tests/spec/'" {
  run bash "$SCRIPT" spec
  [ "$status" -eq 0 ]

  local via_script via_runner nested
  via_script="$(printf '%s\n' "$output" | grep -c '\.bats$')"
  via_runner="$(find tests/spec -name '*.bats' | wc -l)"

  # Positiv-Anker [T002356-M1] ZUERST: es muss ueberhaupt Unterverzeichnis-Tests
  # geben, sonst waere die Gleichheit unten trivial erfuellt.
  nested="$(find tests/spec -mindepth 2 -name '*.bats' | wc -l)"
  [ "$nested" -gt 0 ] || {
    echo "keine Unterverzeichnis-Tests vorhanden — dieser Test prueft nichts" >&2
    return 1
  }

  [ "$via_script" -eq "$via_runner" ] || {
    echo "Fallback liefert $via_script, 'bats -r tests/spec/' sieht $via_runner" >&2
    return 1
  }
}

@test "T002518: der spec-Fallback enthaelt die Unterverzeichnis-Tests wirklich" {
  run bash "$SCRIPT" spec
  [ "$status" -eq 0 ]
  # Stellvertretend zwei real existierende Verzeichnisse, deren Fehlen den
  # urspruenglichen Defekt ausmachte.
  printf '%s\n' "$output" | grep -q '^tests/spec/software-factory/' || {
    echo "tests/spec/software-factory/ fehlt in der Auswahl" >&2; return 1
  }
  printf '%s\n' "$output" | grep -q '^tests/spec/sdlc-cockpit/' || {
    echo "tests/spec/sdlc-cockpit/ fehlt in der Auswahl" >&2; return 1
  }
}

@test "T002518: der unit-Fallback bleibt flach und zieht kein vendortes bats-core ein" {
  run bash "$SCRIPT" unit
  [ "$status" -eq 0 ]

  local via_script via_runner vendored
  via_script="$(printf '%s\n' "$output" | grep -c '\.bats$')"
  via_runner="$(find tests/unit -maxdepth 1 -name '*.bats' | wc -l)"

  # Positiv-Anker: unter tests/unit/lib/ MUSS es .bats geben (die vendorte
  # bats-core-Installation), sonst prueft die Negativ-Aussage unten nichts.
  vendored="$(find tests/unit/lib -name '*.bats' 2>/dev/null | wc -l)"
  [ "$vendored" -gt 0 ] || {
    echo "tests/unit/lib enthaelt keine .bats — Negativtest waere vakuos" >&2
    return 1
  }

  # Die unit-Auswahl ist allowlist-gefiltert, kann also KLEINER sein als die
  # rohe Dateimenge — nur groesser darf sie nie werden.
  [ "$via_script" -le "$via_runner" ] || {
    echo "unit-Fallback liefert $via_script, flach vorhanden sind $via_runner" >&2
    return 1
  }

  if printf '%s\n' "$output" | grep -q '^tests/unit/lib/'; then
    echo "vendortes bats-core in der unit-Auswahl — das darf nie laufen" >&2
    return 1
  fi
}
