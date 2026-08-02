#!/usr/bin/env bats
# T002546 — Übersprungene Dokumente müssen ZÄHLBAR sein, nicht nur einzeln
# beklagt werden.
#
# Pruefmodus: command output verification [T002448-M4]. Die Tests FUEHREN
# scripts/openspec-embed.mjs bzw. den Wrapper aus und pruefen dessen Ausgabe.
#
# Befund 2026-08-02: Beim Stagen von T002544 brach der Hook ab mit
#   input (2251 tokens) is larger than the max context size (2048 tokens). skipping
# Der Hook ist non-fatal, der Commit ging durch, der Plan fehlte im Index.
#
# Beim Stagen von T002543 in derselben Session meldete das bereits vorhandene
# completeness gate:
#   WARN: completeness gate — collection has 121 docs but 141 local active plans
# Das sind 20 fehlende Dokumente — die Zahl, die das Ticket als "ungemessen"
# fuehrte. Das Gate zaehlt aber nur die DIFFERENZ, nennt keinen Grund und
# unterscheidet nicht zwischen "wegen Kontext uebersprungen" und "aus anderem
# Grund nie indiziert".

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  EMBED="${REPO_ROOT}/scripts/openspec-embed.mjs"
  WRAPPER="${REPO_ROOT}/scripts/openspec-embed-local.sh"
}

@test "T002546: das Embed-Skript kennt einen Modus, der nur zaehlt ohne zu schreiben" {
  # Positiv-Anker zuerst [T002356-M1]: das Skript existiert und ist aufrufbar.
  [ -f "${EMBED}" ]
  run node "${EMBED}" --help
  [ "${status}" -eq 0 ]

  # Ein Trockenlauf ist die Voraussetzung dafuer, die Luecke zu messen, ohne
  # den Index zu veraendern.
  [[ "${output}" == *"--count-skipped"* ]]
}

@test "T002546: der Zaehlmodus meldet die Anzahl uebersprungener Dokumente" {
  run node "${EMBED}" --count-skipped
  [ "${status}" -eq 0 ]
  # Eine Zahl, kein "es gab Probleme". Ohne Zahl bleibt die Luecke unsichtbar.
  [[ "${output}" =~ [0-9]+ ]]
  [[ "${output}" == *"skipped"* ]] || [[ "${output}" == *"uebersprungen"* ]]
}

@test "T002546: uebersprungene Dokumente werden nach GRUND unterschieden" {
  # "20 fehlen" ist nicht handlungsleitend. "18 wegen Kontextgrenze, 2 wegen
  # Parse-Fehler" ist es — die beiden brauchen verschiedene Massnahmen.
  run node "${EMBED}" --count-skipped
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"context"* ]] || [[ "${output}" == *"Kontext"* ]]
}

@test "T002546: der Wrapper nennt die Zahl, nicht nur eine Warnzeile" {
  # Der Wrapper ist das, was im Hook laeuft. Solange er nur eine Zeile pro
  # Einzelfall ausgibt, ist die Gesamtlage beim Commit nicht erkennbar.
  [ -f "${WRAPPER}" ]
  run grep -c "count-skipped" "${WRAPPER}"
  [ "${output}" != "0" ]
}

@test "T002546: der Backfill-Weg ist im Zaehl-Output benannt" {
  # Der Bestand holt kein Hook von selbst nach. Wer die Zahl sieht, muss
  # erfahren, womit er sie abbaut — task openspec:embed:backfill existiert
  # bereits, wird aber nirgends im Skip-Pfad genannt.
  run node "${EMBED}" --count-skipped
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"backfill"* ]]
}
