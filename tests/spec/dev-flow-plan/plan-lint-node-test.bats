#!/usr/bin/env bats
# STRUCT2 des Plan-Linters muss 'node --test' als Testrunner anerkennen [T002616].
#
# Pruefmodus: command output verification — der Linter wird AUSGEFUEHRT und sein
# Exit-Status und Output geprueft, nicht seine Quelle gegrept.
#
# Hintergrund: dieses Repo testet .mjs durchgehend ueber node:test
# (scripts/llm-proxy/*.test.mjs, scripts/code-quality/*.test.mjs, sieben
# package.json-Skripte). Kannte STRUCT2 nur bats/vitest/pytest/jest/mocha/go
# test/playwright, scheiterte JEDER Plan mit einem node:test-RED-Step daran —
# unabhaengig von seiner Qualitaet.

setup() {
  LINT="$BATS_TEST_DIRNAME/../../../scripts/plan-lint.sh"
  FIX="$BATS_TEST_DIRNAME/../../unit/fixtures/plan-lint"
}

@test "STRUCT2: ein Plan mit 'node --test' als RED-Step besteht" {
  # Positiv-Anker zuerst (T002356-M1): der bats-Plan muss durchlaufen, sonst
  # ist die Fixture-Basis kaputt und die Aussage unten waere bedeutungslos.
  run bash "$LINT" "$FIX/good.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'PLAN-LINT: PASS'

  # Die eigentliche Aussage: derselbe Plan mit node --test statt bats besteht auch.
  run bash "$LINT" "$FIX/struct2-node-test.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'PLAN-LINT: PASS'
  ! echo "$output" | grep -q 'STRUCT2'
}

@test "STRUCT2 bleibt fail-closed: Fail-Phrase ganz ohne Testrunner scheitert weiter" {
  # Positiv-Anker: der gueltige Fall laeuft durch...
  run bash "$LINT" "$FIX/struct2-node-test.md"
  [ "$status" -eq 0 ]

  # ...und erst dann die Negativ-Aussage. Die Lockerung darf STRUCT2 nicht
  # aushebeln — ein Plan, der 'expected: FAIL' behauptet ohne irgendeinen
  # Runner aufzurufen, muss weiterhin hart scheitern.
  run bash "$LINT" "$FIX/struct2-phrase-no-testcmd.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'STRUCT2'
}
