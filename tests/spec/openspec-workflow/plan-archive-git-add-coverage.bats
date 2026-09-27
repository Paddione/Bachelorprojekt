#!/usr/bin/env bats
# tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats — T004271
#
# Pruefmodus (T002448-M4): Querschnitts-Doku-Guard — die AUSNAHME, bei der
# Source-Grep das angemessene Mittel ist: das bewachte Ergebnis manifestiert
# sich ausschliesslich im Quelltext der Referenz
# (.claude/skills/references/plan-archive-steps.md, Schritt 7 des
# Archiv-Flows). Die `git add`-Liste dort IST die ausfuehrbare Prozedur —
# es gibt kein Laufzeitverhalten, gegen das gemessen werden koennte.
#
# Hintergrund (T004271): Die Referenz listete frueher beim Archiv-Commit eine
# feste `git add`-Pfadliste, die das SSOT-Delta in openspec/specs/ NICHT
# abdeckte (Beleg: T002614, PR #4328, repariert per PR #4334). Seit C7a-1c ist
# die Prozedur der Delete-Flow: archive-plan nach Postgres, DANN git rm auf
# den Plan-Ordner. Die Guards pinnen diese Reihenfolge.
#
# Positiv-Anker (T002356-M1): der erste Test verlangt die Existenz der
# git rm-Zeile mit $PLAN_DIR — ohne sie bestuende der Reihenfolgen-Check
# vakuos gruen.
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

# C7a-1c (T900560): das Archiv-Verb existiert nicht mehr — der Plan-Ordner wird
# per PR geloescht, nachdem der Inhalt nach Postgres archiviert wurde
# (plan-archive-steps.md Delete-Flow). Die T004271-Guards pinnen die NEUE
# Prozedur: (1) git rm auf den Plan-Ordner, (2) archive-plan VOR dem Loeschen.

@test "T004271: Positiv-Anker — die Referenz loescht den Plan-Ordner per git rm" {
  [ -f "$REF" ] || { echo "Referenz fehlt: $REF" >&2; return 1; }
  run grep -E '^git rm ' "$REF"
  [ "$status" -eq 0 ] || { echo "keine 'git rm'-Zeile in $REF gefunden" >&2; return 1; }
  echo "$output" | grep -qF '$PLAN_DIR' || { echo "git rm-Zeile ohne \$PLAN_DIR" >&2; return 1; }
}

@test "T004271: archive-plan steht VOR dem Loeschen des Plan-Ordners" {
  [ -f "$REF" ] || { echo "Referenz fehlt: $REF" >&2; return 1; }
  local archive rmline
  archive=$(grep -n 'ticket.sh archive-plan' "$REF" | head -1 | cut -d: -f1)
  rmline=$(grep -n '^git rm ' "$REF" | head -1 | cut -d: -f1)
  [ -n "$rmline" ] || { echo "keine git rm-Zeile in $REF" >&2; return 1; }
  [ -n "$archive" ] || { echo "kein 'ticket.sh archive-plan' in $REF" >&2; return 1; }
  [ "$archive" -lt "$rmline" ] || { echo "archive-plan steht NACH git rm — Postgres-Kopie ginge verloren" >&2; return 1; }
}

# ── T005564: Status-Sed-Muster deckt 'planning' ab ────────────────────────
# Hintergrund (T005564): Das sed-Muster in Schritt 7 der Referenz
# (active|plan_staged|in_progress) deckt den Status 'planning' nicht ab, der
# bei Fix-Plaenen ohne /opsx:apply der Ist-Zustand ist (beobachtet bei
# T005307: Frontmatter wurde erst NACH dem archive-plan-Lauf im Archiv-Ordner
# korrigiert; die Postgres-Kopie trug weiterhin planning). Querschnitts-Guard
# analog zu T004271: kein Laufzeitverhalten, das sed-Muster IST die Prozedur.

@test "T005564: das Status-Sed-Muster deckt 'planning' ab" {
  [ -f "$REF" ] || { echo "Referenz fehlt: $REF" >&2; return 1; }
  run grep -E 'sed -E -i.*status: ' "$REF"
  [ "$status" -eq 0 ] || { echo "kein Status-Sed-Muster in $REF gefunden" >&2; return 1; }
  echo "$output" | grep -qF 'planning' || { echo "Status-Sed-Muster ohne 'planning'-Alternative" >&2; return 1; }
}
