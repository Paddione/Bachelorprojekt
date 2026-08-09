#!/usr/bin/env bats
# tests/spec/ci-cd/changed-tests-env-hermetic.bats
# SSOT: openspec/specs/ci-cd.md
#
# Pruefmodus: Ergebnis-Verifikation. Der Guard FUEHRT den Runner in einem
# eigenen tmp-Repo aus, mit einem gesetzten FIND_CHANGED_TESTS_FILES in der
# Umgebung, und prueft dessen Ausgabe.
#
# [T003056] Auf main ruft .github/workflows/ci.yml den Spec-Runner als
#   FIND_CHANGED_TESTS_FILES="$DELTA" task test:spec:changed
# auf, um das Merge-Delta zu uebergeben — auf main ist HEAD == origin/main, der
# Default-Diff des Skripts also leer. Die Variable lag damit in der Umgebung
# JEDES von bats gestarteten Tests. Tests, die den Default-Diff-Pfad in einem
# tmp-Repo pruefen, bekamen drinnen den override-Zweig und damit die Dateien des
# AEUSSEREN Repos. Sechs Guards fielen dadurch ausschliesslich auf main
# (T002245 79/80, T002345 81/82, T002377 113/114) — lokal und auf PRs gruen,
# weil die Variable dort nie gesetzt ist. Diagnostisch teuer, weil "gruen auf
# dem PR, rot nach dem Merge" wie Flakiness aussieht.
#
# Dieser Guard haelt die Zusicherung fest: ein gesetztes
# FIND_CHANGED_TESTS_FILES in der Umgebung darf das Ergebnis eines Aufrufs im
# tmp-Repo NICHT veraendern, wenn der Aufrufer den Default-Pfad meint.

setup() {
  bats_require_minimum_version 1.5.0
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  BATS_BIN="$REPO_ROOT/tests/unit/lib/bats-core/bin/bats"
}

@test "T003056: ci-cd.bats-Guards bleiben gruen mit gesetztem FIND_CHANGED_TESTS_FILES" {
  cd "$REPO_ROOT"
  local filter='T002245|T002345|T002377'

  # Positiv-Anker zuerst [T002356-M1]: der Filter trifft ueberhaupt Tests. Ohne
  # das bestuende die Aussage unten auch bei einem Tippfehler im Filter —
  # "0 von 0 Tests rot" ist trivial wahr.
  run bash -c "'$BATS_BIN' --filter '$filter' --count tests/spec/ci-cd.bats"
  [ "$status" -eq 0 ]
  [ "$output" -ge 6 ]

  # Der eigentliche Nachweis: dieselben Guards mit einer Variable in der
  # Umgebung, so wie ci.yml sie auf main hinterlaesst. Der Wert nennt einen
  # Pfad, der im tmp-Repo der Guards nicht existiert — greift der
  # override-Zweig dort, weicht die Auswahl ab und die Guards fallen.
  # Ergebnis-Verifikation ueber den echten Runner, kein Quelltext-grep.
  run bash -c "FIND_CHANGED_TESTS_FILES='scripts/factory/queue.sh' '$BATS_BIN' --filter '$filter' tests/spec/ci-cd.bats"
  if [ "$status" -ne 0 ]; then
    echo "FAIL: Guards fallen mit gesetztem FIND_CHANGED_TESTS_FILES — die Variable leckt in die Tests."
    printf '%s\n' "$output" | grep -E '^not ok' | head -8
    return 1
  fi
}

@test "T003056: test:spec:changed gibt die Variable nicht an bats weiter" {
  cd "$REPO_ROOT"
  # Ergebnis-Verifikation ueber den Runner selbst waere ein >10-min-Vollauf.
  # Geprueft wird deshalb die Naht: nach der Auswahl steht ein unset, und zwar
  # VOR dem bats-Aufruf. Die Reihenfolge ist die Zusicherung — ein unset nach
  # bats waere wirkungslos.
  run bash -c "
    awk '/^  test:spec:changed:/{f=1} f' Taskfile.yml \
      | awk '/unset FIND_CHANGED_TESTS_FILES/{u=NR} /bats-core\/bin\/bats/{if(!b)b=NR} END{print (u && b && u < b) ? \"OK\" : \"FAIL u=\" u \" b=\" b}'
  "
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}
