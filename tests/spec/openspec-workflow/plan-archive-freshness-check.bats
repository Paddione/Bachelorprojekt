#!/usr/bin/env bats
# tests/spec/openspec-workflow/plan-archive-freshness-check.bats — T006369
#
# Pruefmodus (T002448-M4): Querschnitts-Doku-Guard — die AUSNAHME, bei der
# Source-Grep das angemessene Mittel ist: das bewachte Ergebnis manifestiert
# sich ausschliesslich im Quelltext der Referenz
# (.claude/skills/references/plan-archive-steps.md, Schritt 7 des
# Archiv-Flows). Die Sequenz dort (archive -> regenerate -> add -> commit ->
# cherry-pick -> push) IST die ausfuehrbare Prozedur — es gibt kein
# Laufzeitverhalten, gegen das gemessen werden koennte.
#
# Hintergrund (T006369): Nach `openspec.sh archive` + `task freshness:regenerate`
# + Commit trug das committete website/src/data/openspec-status.json den Change
# noch als plan_staged statt archived. CI-Freshness-Gate schlug auf dem
# Archiv-PR #4552 fehl ("regenerated but not staged"); behoben per
# Follow-up-Commit auf dem Archiv-Branch. Ursache (Hypothese, reproduziert):
# die Regeneration lief, bevor die Archiv-Verschiebung im Arbeitsbaum
# vollstaendig sichtbar war. Der Guard erzwingt eine freshness:check-
# Verifikation ZWISCHEN cherry-pick und push — dort traegt der Arbeitsbaum den
# Archiv-Zustand, und ein frischer Regenerationslauf misst den Ist-Zustand.
#
# Positions-Check (T003104): awk-Bereichsmuster begrenzen die Suche auf den
# Abschnitt zwischen `git cherry-pick` und `git push`; ein unverwandter
# freshness:check-Aufruf an anderer Stelle der Datei (z. B. in einer
# Beispiel-Sequenz) kann den Guard nicht gruen faerben.
#
# Positiv-Anker (T002356-M1): der erste Test verlangt die Existenz des Checks
# im Bereich — ohne die Haertung ist der Bereich leer und beide Tests
# schlagen fehl, statt vakuos gruen zu sein.
#
# Hinweis: `fail` aus bats-support wird hier bewusst nicht benutzt — in
# tests/spec/openspec-workflow/ wird test_helper.bash nicht autoloaded
# (bats-core laedt nur test_helper.bash aus dem Testdatei-Verzeichnis),
# ein Aufruf schluege mit "fail: command not found" fehl, statt die
# eigentliche Meldung zu zeigen. Fehlerpfade nutzen echo+return (Muster
# der bestehenden Guards in diesem Verzeichnis, z. B. T002375-p5).

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  REF="$REPO/.claude/skills/references/plan-archive-steps.md"
}

@test "T006369: Positiv-Anker — freshness:check-Verifikation liegt zwischen cherry-pick und push" {
  [ -f "$REF" ] || { echo "Referenz fehlt: $REF" >&2; return 1; }
  run awk '/git cherry-pick/,/git push/' "$REF"
  [ "$status" -eq 0 ] || { echo "awk-Bereichsmuster fehlgeschlagen" >&2; return 1; }
  echo "$output" | grep -qF 'task freshness:check' \
    || { echo "keine freshness:check-Verifikation zwischen cherry-pick und push in $REF" >&2; return 1; }
}

@test "T006369: der Drift-Pfad amends den Archiv-Commit vor dem Push" {
  [ -f "$REF" ] || { echo "Referenz fehlt: $REF" >&2; return 1; }
  run awk '/git cherry-pick/,/git push/' "$REF"
  [ "$status" -eq 0 ] || { echo "awk-Bereichsmuster fehlgeschlagen" >&2; return 1; }
  echo "$output" | grep -qF 'git commit --amend' \
    || { echo "kein git commit --amend im Drift-Pfad zwischen cherry-pick und push in $REF" >&2; return 1; }
}
