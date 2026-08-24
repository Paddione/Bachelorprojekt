#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# T015826: Der Auto-Title-Rename-Pfad (.github/workflows/pr-auto-title.yml)
# darf bestehende [T000XXX]-Tags im PR-Titel nicht verwerfen — sonst findet
# scripts/factory/auto-close-merged.sh die Ticket-Referenz nicht und der
# gemergte PR schliesst das Ticket nicht ("Merge = closure", T001092).
# Erwartet: Tag-Erhalt aus dem Titel ODER Rekonstruktion aus dem Branch-Namen
# (fix/tNNNN-… bzw. …-T015826), angehaengt an den abgeleiteten Titel.
#
# Pruefmodus: Source-Grep auf CI-Konfiguration — das Ergebnis manifestiert
# sich ausschliesslich im Workflow-Text (Ausnahme laut tests/CLAUDE.md).

@test "T015826: pr-auto-title Rename erhaelt bestehende [T000XXX]-Tags" {
  local repo_root wf
  repo_root="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  wf="${repo_root}/.github/workflows/pr-auto-title.yml"

  # Positiv-Anker: Workflow und Rename-Pfad existieren ueberhaupt — ohne sie
  # waeren alle folgenden Assertionen vakuos.
  [ -f "$wf" ]
  grep -q 'Deriving title from branch name' "$wf"

  # 1) Ein vorhandener Tag wird aus dem PR-Titel extrahiert.
  grep -qF '\[T[0-9]{6}\]' "$wf" || {
    echo "FAIL: pr-auto-title.yml extrahiert keinen [T000XXX]-Tag aus dem PR-Titel."
    echo "      Der Rename-Pfad baut den neuen Titel rein aus dem Branch-Slug und"
    echo "      verwirft damit jeden Ticket-Tag — auto-close-merged.sh findet die"
    echo "      Referenz nicht und das Ticket bleibt offen (bricht T001092)."
    return 1
  }

  # 2) Fehlt der Tag im Titel, wird er aus dem Branch-Namen rekonstruiert
  #    (Konventionen: fix/tNNNN-… Praefix und …-TNNNNNN Suffix).
  grep -qF 'TAG_FROM_BRANCH' "$wf" || {
    echo "FAIL: pr-auto-title.yml rekonstruiert den Ticket-Tag nicht aus dem Branch-Namen."
    return 1
  }
  grep -qF '${TAG_FROM_BRANCH^^}' "$wf" || {
    echo "FAIL: Branch-Tag wird nicht in Grossform als [TNNNNNN] formatiert."
    return 1
  }

  # 3) Der abgeleitete Titel haengt den Tag an.
  grep -qE 'NEW_TITLE=.*\$\{TICKET_TAG\}' "$wf" || {
    echo "FAIL: NEW_TITLE enthaelt den erhaltenen/rekonstruierten TICKET_TAG nicht."
    return 1
  }
}
