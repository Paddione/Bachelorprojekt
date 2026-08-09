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

@test "T003095: kein --prune auf den origin/main-Fetch-Zeilen" {
  # [T003095] TEILKORREKTUR zu T003054: das fuehrende + allein genuegt nicht.
  # --prune loescht refs/remotes/origin/main, BEVOR derselbe Fetch sie
  # aktualisiert. actions/checkout setzt refs/remotes/origin/HEAD auf
  # refs/remotes/origin/main; nach dem Prune haengt HEAD in der Luft und die
  # Aktualisierung kann die Ref nicht mehr sperren:
  #   - [deleted]  (none)  -> origin/main
  #     (refs/remotes/origin/HEAD has become dangling)
  #   error: cannot lock ref 'refs/remotes/origin/main': unable to resolve reference
  #   ! d224ed0...06cc3d9 main -> origin/main  (unable to update local ref)
  # Das + hat die Meldung veraendert (vorher '[rejected] non-fast-forward'), nicht
  # die Ursache. --prune ist hier ohnehin zwecklos: geholt wird genau EINE Ref per
  # explizitem Refspec. Lokal zeichengleich reproduziert (mit --prune rc=1, ohne
  # rc=0). Belegt an Run 31334724203.
  #
  # Positiv-Anker zuerst [T002356-M1]: die Fetch-Zeilen existieren ueberhaupt.
  run bash -c "grep -rhc 'git fetch .*main:refs/remotes/origin/main' '$WF_DIR' | paste -sd+ | bc"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Und keine davon traegt --prune.
  run bash -c "grep -rh 'git fetch .*main:refs/remotes/origin/main' '$WF_DIR' | grep -c -- '--prune' || true"
  [ "$output" -eq 0 ]
}
