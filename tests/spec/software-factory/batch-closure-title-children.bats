#!/usr/bin/env bats
# tests/spec/software-factory/batch-closure-title-children.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T003797 — auto-close-merged.sh extrahiert die in runden Klammern
# gelieferten Kinder-Ticket-IDs aus Batch-PR-Titeln und schliesst sie zusammen
# mit dem Parent-Ticket.
#
# PRUEFMODUS: COMMAND OUTPUT VERIFICATION (CLAUDE.md → Test-Resultats-Konvention).
# Der Test ruft die Extraktionsfunktion aus scripts/factory/auto-close-merged.sh
# per source auf und prueft deren AUSGABE — er greppt NICHT den Quelltext.
#
# Fall 4 ist der Falsch-Positiv-Anker: runde Klammern ohne Ticket-IDs kommen in
# Commit-Titeln staendig vor. Fall 5 der Regressionsanker: Einzel-PRs duerfen sich
# nicht aendern.

load '_sf_common'

setup() { _sf_setup; }

# _extract <titel> — ruft extract_ticket_ids_from_title in einer Subshell auf,
# normiert die Ausgabe zu einer durch Leerzeichen getrennten Zeile und legt sie
# in $got ab. `$status` ist der Exit-Code des Skript-Aufrufs.
_extract() {
  run bash -c 'source "'"$REPO_ROOT"'/scripts/factory/auto-close-merged.sh"; extract_ticket_ids_from_title "$1"' _ "$1"
  got="$(printf '%s' "$output" | paste -sd' ' -)"
}

@test "T003797: Batch-Titel extrahiert Parent zuerst, dann Kinder in Titel-Reihenfolge" {
  _extract "feat(ci): Batch CI/Check-Auswertung Fixes (T003109,T002815,T002922) [T003540]"
  [ "$status" -eq 0 ]
  [ "$got" = "T003540 T003109 T002815 T002922" ]
}

@test "T003797: zweiter Batch-Titel — nur die drei gelieferten Kinder" {
  _extract "feat(ci): Batch P1 worktree-health (T002994,T002995,T002998) [T003539]"
  [ "$status" -eq 0 ]
  [ "$got" = "T003539 T002994 T002995 T002998" ]
}

@test "T003797: dritter Batch-Titel — sieben gelieferte Kinder" {
  _extract "feat(ci): Batch Meta-Fixes (T002937,T003134,T003174,T003176,T003229,T003284,T003546) [T003541]"
  [ "$status" -eq 0 ]
  [ "$got" = "T003541 T002937 T003134 T003174 T003176 T003229 T003284 T003546" ]
}

@test "T003797: runde Klammern ohne Ticket-IDs liefern nur den Parent (Falsch-Positiv-Anker)" {
  _extract "fix(ci): preflight-pr-scope matcht ALLE Ticket-IDs im PR-Titel [T003103]"
  [ "$status" -eq 0 ]
  [ "$got" = "T003103" ]
}

@test "T003797: Einzel-PR bleibt unveraendert (Regressionsanker)" {
  _extract "fix(ci): repariere (endlich) den Watcher [T001234]"
  [ "$status" -eq 0 ]
  [ "$got" = "T001234" ]
}

@test "T003797: Titel ohne Ticket-ID liefert leere Ausgabe" {
  _extract "chore: kein Ticket im Titel"
  [ "$status" -eq 0 ]
  [ -z "$got" ]
}

@test "T003797: doppelte Kinder-IDs werden dedupliziert" {
  _extract "feat(ci): Batch Dupe (T003200,T003200,T003201) [T003202]"
  [ "$status" -eq 0 ]
  [ "$got" = "T003202 T003200 T003201" ]
}
