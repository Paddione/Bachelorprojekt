#!/usr/bin/env bats
# tests/spec/selection-integrity/dead-selections.bats
# Ticket: T900677
#
# Selection-Integritaet: kein Spec-Guard darf seine Auswahl-Anbindung
# verlieren (T900677). scripts/find-dead-selections.sh vergleicht die live
# erreichbaren Guards gegen den committeten Snapshot — ein Reorg-Move, der
# einen Guard unerreichbar macht, wird hier rot statt still.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "selection snapshot is exact: no lost selection, no stale entries" {
  run bash "$REPO_ROOT/scripts/find-dead-selections.sh" --check
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"lost=0"* ]]
  [[ "$output" == *"stale=0"* ]]
  [[ "$output" == *"incomplete=0"* ]]
}
