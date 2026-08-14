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
# Hintergrund (T004271): Die Referenz listete beim Archiv-Commit eine feste
# `git add`-Pfadliste, die openspec/specs/ NICHT abdeckte — obwohl
# `scripts/openspec.sh cmd_archive` die Delta-Specs dorthin merged
# (openspec-merge.mjs batch, Pass 2, dry_run=false; SSOT-Mutation).
# Folgte der Implementer der Referenz woertlich, blieb das SSOT-Delta
# unstaged und ging beim naechsten Rebase/Cleanup still verloren — die SSOT
# verlor den Anforderungstext, ohne dass ein Guard anschlug.
# Beleg: T002614 (PR #4328, Commit 5b70a791), repariert per Follow-up
# PR #4334 ("chore(plans): merge T002614 delta into openspec SSOT").
#
# Mutationspfade des Archiv-Verbs (scripts/openspec.sh cmd_archive), gegen
# die die git add-Liste abgeglichen wird:
#   - openspec/specs/                       : SSOT-Delta-Merge (openspec-merge.mjs batch, Pass 2)
#   - openspec/changes/                     : Move-Quelle  (mv "$dir" "$dest")
#   - openspec/changes/archive/             : Move-Ziel    (mv "$dir" "$dest")
#   - website/src/data/openspec-status.json : Regeneration (openspec-status-map.sh) + eigenes Staging (T003136)
#
# Positiv-Anker (T002356-M1): der erste Test verlangt die Existenz der
# git add-Zeile mit openspec/changes/ — ohne sie bestuenden die
# Pfad-Checks vakuos gruen.
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

# Pfadgruppen, die `scripts/openspec.sh archive` mutiert — die git add-Liste
# der Referenz muss jede abdecken, sonst bleibt die Mutation unstaged.
ARCHIVE_MUTATION_PATHS=(
  'openspec/changes/'
  'openspec/changes/archive/'
  'openspec/specs/'
  'website/src/data/openspec-status.json'
)

@test "T004271: Positiv-Anker — die Referenz traegt eine git add-Liste mit openspec/changes/" {
  [ -f "$REF" ] || { echo "Referenz fehlt: $REF" >&2; return 1; }
  run grep -E '^git add ' "$REF"
  [ "$status" -eq 0 ] || { echo "keine 'git add'-Zeile in $REF gefunden" >&2; return 1; }
  echo "$output" | grep -qF 'openspec/changes/' || { echo "git add-Zeile ohne openspec/changes/" >&2; return 1; }
}

@test "T004271: die git add-Liste deckt jeden vom Archiv-Verb mutierten Pfad ab" {
  [ -f "$REF" ] || { echo "Referenz fehlt: $REF" >&2; return 1; }
  run grep -E '^git add ' "$REF"
  [ "$status" -eq 0 ] || { echo "keine 'git add'-Zeile in $REF gefunden" >&2; return 1; }
  for p in "${ARCHIVE_MUTATION_PATHS[@]}"; do
    echo "$output" | grep -qF -- "$p" \
      || { echo "git add-Liste deckt den vom Archiv-Verb mutierten Pfad '$p' nicht ab" >&2; return 1; }
  done
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
  run grep -E 'sed -E -i.*status: \(active\|plan_staged\|in_progress\)' "$REF"
  [ "$status" -eq 0 ] || { echo "kein Status-Sed-Muster in $REF gefunden" >&2; return 1; }
  echo "$output" | grep -qF 'planning' || { echo "Status-Sed-Muster ohne 'planning'-Alternative" >&2; return 1; }
}
