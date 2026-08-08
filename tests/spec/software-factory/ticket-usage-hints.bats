#!/usr/bin/env bats
# [T002697] Bei unbekanntem Argument nennt ticket.sh den Weg zur erwarteten Form.
#
# Pruefmodus: command output verification [T002448-M4] — die Tests RUFEN das
# Skript mit einem falschen Argument auf und pruefen die Ausgabe.
#
# Vorgeschichte (2026-08-08): 'ticket.sh comment T002657 --body …' und
# 'ticket.sh add-pr-link --id T --url …' meldeten nur
#   Unknown add-comment option: T002657
# ohne zu sagen, was stattdessen erwartet wird. Die Liste der Pflichtflags steht
# im Code NACH der Argument-Schleife und wird bei einem unbekannten Argument nie
# erreicht — sie erscheint nur beim Aufruf ganz ohne Argumente. Wer die
# Reihenfolge nicht kennt, raet.
#
# Die Unterbefehle liegen in zwei Dateien: scripts/ticket.sh und die
# ausgelagerten scripts/lib/ticket-*.sh. Der Test deckt beide ab, weil der
# erste Fix-Versuch nur die Hauptdatei erfasste und add-pr-link (in
# scripts/lib/ticket-links.sh) still unveraendert blieb.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/ticket.sh"
}

@test "T002697: unbekanntes Argument nennt den Weg zur erwarteten Form (ticket.sh)" {
  run bash "$SCRIPT" comment T002657 --body irrelevant

  [ "$status" -ne 0 ]
  [[ "$output" == *"Unknown add-comment option"* ]]
  [[ "$output" == *"Aufruf ohne Argumente"* ]]
}

@test "T002697: dasselbe fuer Unterbefehle aus scripts/lib/ (add-pr-link)" {
  run bash "$SCRIPT" add-pr-link --id T000001 --url http://example.test

  [ "$status" -ne 0 ]
  [[ "$output" == *"Unknown add-pr-link option"* ]]
  [[ "$output" == *"Aufruf ohne Argumente"* ]]
}

@test "T002697: der Aufruf ohne Argumente nennt weiterhin die Pflichtflags" {
  # Positiv-Anker: der Hinweis oben verweist auf diesen Aufruf. Bliebe er
  # wirkungslos, waere der Hinweis eine Sackgasse und die beiden Tests darueber
  # bestuenden trotzdem.
  run bash "$SCRIPT" add-pr-link

  [ "$status" -ne 0 ]
  [[ "$output" == *"--id"* ]]
  [[ "$output" == *"--pr"* ]]
  [[ "$output" == *"required"* ]]
}
