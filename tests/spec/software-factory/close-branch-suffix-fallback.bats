#!/usr/bin/env bats
# tests/spec/software-factory/close-branch-suffix-fallback.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T015960 — auto-close-merged.sh übersprang gemergte PRs, deren Titel
# keinen [T-NNNNNN]-Tag trägt (real: PR #5214 "chore: reaper spec atlas
# allowlist T015919" → T015919 blieb offen). Fix: Fallback auf die Ticket-ID
# im Branch-Suffix (-T<id>), danach validiert wie gehabt der Identity-Guard.
#
# PRUEFMODUS: COMMAND OUTPUT VERIFICATION für die Extraktionsfunktion
# (source + Aufruf, Ausgabe prüfen — wie batch-closure-title-children.bats).
# Der Loop-Wiring (Fallback wird im while-Loop AUCH gerufen) manifestiert sich
# nur im Quelltext — er ist als EIN Querschnitts-Grep dokumentiert und vom
# Output-Teil getrennt.

load '_sf_common'

setup() { _sf_setup; }

_branch_extract() {
  run bash -c 'source "'"$REPO_ROOT"'/scripts/factory/auto-close-merged.sh"; extract_ticket_id_from_branch "$1"' _ "$1"
  got="$(printf '%s' "$output" | paste -sd' ' -)"
}

@test "T015960: Branch-Suffix liefert die Ticket-ID (PR #5214-Fall)" {
  _branch_extract "chore/reaper-spec-atlas-allowlist-T015919"
  [ "$status" -eq 0 ]
  [ "$got" = "T015919" ]
}

@test "T015960: fix-Branch mit Suffix wird erkannt" {
  _branch_extract "fix/filen-seal-doubleencode-T015921"
  [ "$status" -eq 0 ]
  [ "$got" = "T015921" ]
}

@test "T015960: letztes Match gewinnt, wenn Slug-Teile Ziffern tragen" {
  _branch_extract "fix/foo2bar-baz-T001234"
  [ "$status" -eq 0 ]
  [ "$got" = "T001234" ]
}

@test "T015960: Branch ohne T-ID liefert leer (dann skippt der Loop)" {
  _branch_extract "feature/no-ticket-here"
  [ "$status" -eq 0 ]
  [ -z "$got" ]
}

@test "T015960: Titel-Extraktion bleibt unberührt (Regressionsanker)" {
  run bash -c 'source "'"$REPO_ROOT"'/scripts/factory/auto-close-merged.sh"; extract_ticket_ids_from_title "$1"' _ "fix(ci): repariere den Watcher [T001234]"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | paste -sd' ' -)" = "T001234" ]
}

@test "T015960: Loop-Wiring — Fallback ist im while-Loop verdrahtet (Querschnitts-Grep)" {
  # Querschnittsprüfung: das Verhalten „Fallback statt Skip“ lässt sich ohne
  # gh+Cluster nicht ausführen; die Verdrahtung selbst ist hier der Gegenstand.
  run grep -c 'extract_ticket_id_from_branch' "$REPO_ROOT/scripts/factory/auto-close-merged.sh"
  [ "$status" -eq 0 ]
  # Mindestens Definition + Loop-Aufruf (>=2), sonst fehlt das Wiring.
  [ "$output" -ge 2 ]
}
