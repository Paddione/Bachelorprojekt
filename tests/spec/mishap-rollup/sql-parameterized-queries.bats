#!/usr/bin/env bats
# tests/spec/mishap-rollup/sql-parameterized-queries.bats — T013919
#
# SSOT: openspec/specs/mishap-rollup.md
# PRUEFMODUS (T002448-M4): Statement-Verifikation gegen das Generator-Skript —
# SQL-Abfragen muessen CONTAINER_ID als gebundenen psql-Parameter uebergeben
# statt den Wert in den SQL-String zu interpolieren (Security-Review-Befund
# nach T013915). Pinning: Positiv-Anker auf die -v-Uebergabe und das
# Quoting-Muster, Negativ-Assert auf die Interpolationsform.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/factory/mishap-rollup.sh"
}

@test "T013919: Positiv-Anker — gebundener Parameter -v container_id vorhanden" {
  # Erst der positive Fall: die Parameter-Uebergabe muss existieren, sonst
  # waere der Negativ-Assert unten vakuos (T002356-M1).
  run grep -n "factory_psql -v container_id=" "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T013919: keine Interpolation von CONTAINER_ID in SQL-Strings" {
  # Die Interpolationsform '${CONTAINER_ID}' darf im Skript nicht mehr
  # vorkommen — alle SQL-Abfragen muessen den gebundenen Parameter
  # :'container_id' verwenden.
  run grep -cF "external_id = '\${CONTAINER_ID}'" "$SCRIPT"
  [ "$status" -eq 1 ]
  [ "$output" = "0" ]
}

@test "T013919: Container-ID wird am Skriptanfang validiert (fail-closed)" {
  # CONTAINER_ID kommt aus der rollup-container-Resolution und fließt in
  # Slugs, Branches und SQL — vor jeder Nutzung gegen ein striktes Muster
  # validieren, bei Abweichung abbrechen.
  run grep -nF '=~ ^[A-Za-z0-9._-]+$' "$SCRIPT"
  [ "$status" -eq 0 ]
  run grep -n 'CONTAINER_ID.*=~' "$SCRIPT"
  [ "$status" -eq 0 ]
}
