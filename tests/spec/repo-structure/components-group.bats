#!/usr/bin/env bats
# SSOT: openspec/changes/repo-structure-reorg (T006999, Partial p3-components)
# Prüfmodus: Dateisystem-Output-Verifikation über test -d auf den Arbeitsbaum
# (T002448-M4) — das Ergebnis des Moves ist das Dateisystem, kein Source-Grep.
# Positiv-Anker zuerst (T002356-M1): der gültige Fall (components/) muss durchlaufen,
# bevor die Negativ-Aussage (keine Top-Level-Ordner) zählt.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "repo-structure: fünf Komponenten unter components/, keine Top-Level-Ordner" {
  # Positiv-Anker: der gültige Fall
  [[ -d "$REPO_ROOT/components" ]]
  for c in brett studio-server mentolder-web mediaviewer-widget VideoVault; do
    [[ -d "$REPO_ROOT/components/$c" ]]
  done
  # Negativ-Aussage: kein Top-Level-Verzeichnis mehr
  for c in brett studio-server mentolder-web mediaviewer-widget VideoVault; do
    [[ ! -d "$REPO_ROOT/$c" ]]
  done
}
