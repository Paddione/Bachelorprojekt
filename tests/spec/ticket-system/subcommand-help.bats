#!/usr/bin/env bats
# [T002843] ticket.sh: --help/-h auf Subkommando-Ebene und `help` auf Kommando-Ebene
# fuehren zur Optionsliste statt in eine Fehlermeldung.
#
# Pruefmodus: command output verification [T002448-M4] — die Tests RUFEN
# scripts/ticket.sh auf und pruefen $status und $output. Kein Source-Grep.
#
# Semantik statt Darstellung [T002716]: geprueft wird der Exit-Code, die
# Abwesenheit einer "Unknown …"-Zurueckweisung und das Vorhandensein der
# Flagnamen — NICHT der Wortlaut, die Reihenfolge oder das Layout der Hilfe.
#
# Vorgeschichte (2026-08-09, repo-hygiene-Lauf): Die Kommando-EBENE ist
# auffindbar (`ticket.sh` ohne Argumente listet alle Kommandos), die
# Options-EBENE nicht. `--help` wird von der Options-Schleife des jeweiligen
# Subkommandos als unbekannte Option abgewiesen (Exit 2), statt VOR der
# Schleife abgefangen zu werden. `help` und `--help` auf oberster Ebene laufen
# in "Unknown command" (Exit 1). Wer wissen will, welche Optionen `create`
# nimmt und welche davon Pflicht sind, hat ueber das Skript keinen Weg dorthin.
#
# Muster fuer den Fix: scripts/worktree-create.sh faengt --help vor allen
# Guards ab (T002783).
#
# Die Subkommandos liegen in drei Dateien: scripts/ticket.sh selbst,
# scripts/vda/ticket/*.sh (create) und scripts/lib/ticket-*.sh (add-pr-link).
# Der Test deckt alle drei ab, weil ein Fix, der nur die Hauptdatei erfasst,
# die ausgelagerten Subkommandos still unveraendert laesst (so geschehen bei
# T002697).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/ticket.sh"
}

@test "T002843: Positiv-Anker — der Aufruf ohne Argumente listet die Kommandos" {
  # Anker fuer die "darf nicht"-Zusicherungen weiter unten: waere das Skript
  # generell nicht lauffaehig (fehlende Abhaengigkeit, Syntaxfehler), lieferte
  # es gar keine Ausgabe und jede Abwesenheits-Pruefung bestuende vakuos.
  run bash "$SCRIPT"

  [ "$status" -ne 0 ]
  [[ "$output" == *"create"* ]]
  [[ "$output" == *"stage-plan"* ]]
}

@test "T002843: 'ticket.sh help' zeigt die Kommandoliste statt 'Unknown command'" {
  run bash "$SCRIPT" help

  [ "$status" -eq 0 ]
  [[ "$output" != *"Unknown command"* ]]
  [[ "$output" == *"create"* ]]
  [[ "$output" == *"stage-plan"* ]]
}

@test "T002843: 'ticket.sh --help' zeigt die Kommandoliste statt 'Unknown command'" {
  run bash "$SCRIPT" --help

  [ "$status" -eq 0 ]
  [[ "$output" != *"Unknown command"* ]]
  [[ "$output" == *"create"* ]]
}

@test "T002843: 'create --help' nennt die Optionen inkl. der Pflichtfelder" {
  run bash "$SCRIPT" create --help

  [ "$status" -eq 0 ]
  [[ "$output" != *"Unknown create option"* ]]
  # Pflichtfelder laut scripts/vda/ticket/create.sh — die Auskunft, wegen der
  # das Ticket entstand (das CLAUDE.md-Beispiel nennt --description nicht).
  [[ "$output" == *"--type"* ]]
  [[ "$output" == *"--title"* ]]
  [[ "$output" == *"--description"* ]]
}

@test "T002843: '-h' wirkt wie '--help' (update-status, Subkommando in ticket.sh)" {
  run bash "$SCRIPT" update-status -h

  [ "$status" -eq 0 ]
  [[ "$output" != *"Unknown update-status option"* ]]
  [[ "$output" == *"--id"* ]]
  [[ "$output" == *"--status"* ]]
}

@test "T002843: dasselbe fuer Subkommandos aus scripts/lib/ (add-pr-link)" {
  run bash "$SCRIPT" add-pr-link --help

  [ "$status" -eq 0 ]
  [[ "$output" != *"Unknown add-pr-link option"* ]]
  [[ "$output" == *"--id"* ]]
  [[ "$output" == *"--pr"* ]]
}

@test "T002843: ein wirklich unbekanntes Argument bleibt ein Fehler" {
  # Gegenprobe: der --help-Vorabgriff darf die Options-Schleife nicht
  # entschaerfen. Ohne diesen Test bestuende ein Fix, der jede unbekannte
  # Option kommentarlos als Hilfeaufruf behandelt.
  run bash "$SCRIPT" update-status --voellig-unbekannt

  [ "$status" -ne 0 ]
  [[ "$output" == *"Unknown update-status option"* ]]
}
