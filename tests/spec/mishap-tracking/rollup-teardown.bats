#!/usr/bin/env bats
# SSOT: openspec/specs/mishap-tracking.md
# Ticket: T014104 — Der Mishap-Rollup-Automat ist abgebaut; kein Prozess erzeugt
# noch Sammelcontainer. Der Container war selbst-resurrektierend: sein Entfernen
# war die Ausloesebedingung fuer den naechsten (ticket.sh:1049 Autocreate).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WAKEUP_SH="${REPO_ROOT}/scripts/factory/wakeup.sh"
  TICKET_SH="${REPO_ROOT}/scripts/ticket.sh"
  MISHAP_GO="${REPO_ROOT}/scripts/ticket-mcp/go/internal/tools/mishap.go"
}

@test "wakeup.sh ruft keinen Rollup-Generator auf" {
  # Positiv-Anker: die Datei existiert und traegt echten Inhalt. Ohne ihn wuerde
  # ein leerer/fehlender Pfad den Negativ-Check faelschlich gruen faerben.
  [ -f "$WAKEUP_SH" ]
  grep -q 'factory' "$WAKEUP_SH"

  run grep -n 'mishap-rollup' "$WAKEUP_SH"
  [ "$status" -ne 0 ]
}

@test "ticket.sh kennt kein rollup-container-Kommando" {
  # Positiv-Anker: ticket.sh antwortet ueberhaupt auf ein bekanntes Kommando.
  run bash "$TICKET_SH" help
  [ "$status" -eq 0 ]

  # Das entfernte Kommando darf nicht mehr aufloesen.
  run grep -n 'cmd_rollup_container\|rollup-container)' "$TICKET_SH"
  [ "$status" -ne 0 ]
}

@test "mishap.go traegt keine ROLLUP-Konstanten mehr" {
  [ -f "$MISHAP_GO" ]
  grep -q 'package tools' "$MISHAP_GO"

  run grep -n 'ROLLUP_BRANCH\|ROLLUP_CHANGE_DIR\|rollup-container' "$MISHAP_GO"
  [ "$status" -ne 0 ]
}

@test "die Rollup-Skripte sind entfernt" {
  # Positiv-Anker: das Verzeichnis existiert und enthaelt weiterhin Factory-Skripte.
  [ -d "${REPO_ROOT}/scripts/factory" ]
  [ -f "${REPO_ROOT}/scripts/factory/wakeup.sh" ]

  run bash -c "ls ${REPO_ROOT}/scripts/factory/ | grep -E 'rollup'"
  [ "$status" -ne 0 ]
}

@test "kein Rollup-Spec und keine Rollup-Testsuite mehr" {
  # Positiv-Anker: die Nachbar-Spec lebt weiter — der Abbau trifft den Automaten,
  # nicht die Erfassung.
  [ -f "${REPO_ROOT}/openspec/specs/mishap-tracking.md" ]

  [ ! -f "${REPO_ROOT}/openspec/specs/mishap-rollup.md" ]
  [ ! -d "${REPO_ROOT}/tests/spec/mishap-rollup" ]
}

@test "keine verwaisten Rollup-Change-Verzeichnisse" {
  # Positiv-Anker: das changes/-Verzeichnis existiert.
  [ -d "${REPO_ROOT}/openspec/changes" ]

  run bash -c "ls ${REPO_ROOT}/openspec/changes/ | grep -E '^mishap-incident-rollup'"
  [ "$status" -ne 0 ]
}
