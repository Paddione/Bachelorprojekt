#!/usr/bin/env bats
# tests/spec/openspec-workflow/archive-consistency.bats — T003813
#
# Batch T003813: OpenSpec-Archiv-Konsistenz auf main. Die drei Batch-Kinder
# (T003504, T003510, T003512) waren Mishap-Fixes der Familie „Change erreicht
# main nicht oder in falscher Form" — ein Archiv-Commit blieb auf dem Branch
# zurueck, main zeigte den Change weiterhin live (T003504); Deltas widersprachen
# dem umgesetzten Fix (T003510/T003512). Alle drei sind auf main geheilt und
# obsolet; diese Datei pinnt den geheitten Zustand als Regression-Guard:
# die drei Slugs liegen im Archiv und NICHT live unter openspec/changes/.
#
# Pruefmodus (T002448-M4): Output-Verifikation — die Tests pruefen den realen
# Dateisystem-Zustand des Repo-Baums (find/Ausgabe), kein Source-Grep.
# Positiv-Anker (T002356-M1): der Archiv-Eintrag pro Slug wird zuerst
# geprueft; erst danach die Negativ-Aussage (nicht live). Fehlt der
# Archiv-Eintrag, faellt der Test rot — kein vakuoses Bestehen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CHANGES="${REPO_ROOT}/openspec/changes"
  ARCHIVE="${CHANGES}/archive"
}

# Die drei Batch-Kinder-Slugs — Fixes aus T003504/T003510/T003512, deren
# Archiv-Zustand erst nach main gebracht werden musste.
BATCH_CHILD_SLUGS=(
  agent-lock-scope-regelwerk
  fix-systemtest-cronjobs-sdlc-T002644
  fix-loadout-model-paths-T002886
)

@test "T003813: alle drei Batch-Kinder sind im Archiv und nicht live" {
  # Positiv-Anker: jeder Slug hat einen Archiv-Eintrag <datum>-<slug>.
  for slug in "${BATCH_CHILD_SLUGS[@]}"; do
    run find "$ARCHIVE" -maxdepth 1 -type d -name "????-??-??-${slug}"
    [ "$status" -eq 0 ]
    [ -n "$output" ] || fail "kein Archiv-Eintrag fuer ${slug}"
  done

  # Negativ-Aussage: kein Slug liegt live unter openspec/changes/.
  for slug in "${BATCH_CHILD_SLUGS[@]}"; do
    [ ! -d "${CHANGES}/${slug}" ] || fail "${slug} ist wieder live unter openspec/changes/"
  done
}
