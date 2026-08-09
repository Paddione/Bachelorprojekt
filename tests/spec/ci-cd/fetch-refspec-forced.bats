#!/usr/bin/env bats
# tests/spec/ci-cd/fetch-refspec-forced.bats
# SSOT: openspec/specs/ci-cd.md
#
# Pruefmodus: Quelltext-Pruefung der Workflow-Dateien. Das ist hier das
# angemessene Mittel und keine Verletzung der Output-Konvention [T002448-M4] —
# das Ergebnis manifestiert sich ausschliesslich in der CI-Konfiguration, und
# der Defekt tritt ausschliesslich beim Push auf main auf, also in einer
# Umgebung, die ein BATS-Lauf nicht herstellen kann.
#
# [T003054] Die Schritte "Fetch origin/main for diffing" holten origin/main mit
#   git fetch --no-tags --prune --depth=1 origin main:refs/remotes/origin/main
# also OHNE fuehrendes + (kein Force-Update). Bei einem Push auf main hat
# actions/checkout refs/remotes/origin/main schon gesetzt; der --depth=1-Fetch
# liefert eine Historie, die kein Fast-Forward davon ist, und git lehnt ab:
#   ! [rejected] main -> origin/main (non-fast-forward)
# Der Schritt endet Exit 1 und laeuft VOR allen Tests — jeder Job starb, ohne
# einen einzigen Test auszufuehren, waehrend der Aggregat-Gate nur
# "Factory-Gates nicht gruen" meldete. Auf Pull Requests tritt es nie auf, weil
# HEAD dort ein Merge-Ref ist und origin/main fast-forwardbar bleibt: PRs gruen,
# main bei jedem Post-Merge-Lauf rot.

WF_DIR="${BATS_TEST_DIRNAME}/../../../.github/workflows"

@test "T003054: jeder origin/main-Fetch-Refspec ist ein Force-Update (+)" {
  # Positiv-Anker zuerst [T002356-M1]: Ohne ihn waere die Negativ-Aussage
  # vakuos, sobald die Schritte umbenannt oder entfernt werden — eine leere
  # Kandidatenliste enthaelt trivial keinen unforced Refspec.
  run bash -c "grep -rho 'main:refs/remotes/origin/main' '$WF_DIR' | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Kein Vorkommen ohne fuehrendes + . Das Zeichen vor "main:" muss ein + sein;
  # gezaehlt werden die Treffer, denen es fehlt.
  run bash -c "grep -rhoE '.main:refs/remotes/origin/main' '$WF_DIR' | grep -cv '^\\+'"
  [ "$output" -eq 0 ]
}
