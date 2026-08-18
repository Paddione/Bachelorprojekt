#!/usr/bin/env bats
# SSOT: openspec/specs/devflow-selection-archive-hardening.md
# Ticket: T009368
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4) — die Selektionslogik
# `select_merge_commit` aus scripts/devflow-post-merge-deploy.sh laeuft hier
# gegen ein frisch initialisiertes temp-Git-Repo, und ihr Ergebnis (der
# gelieferte Commit-SHA) wird geprueft. Kein Source-Grep: geprueft wird das
# Laufzeitverhalten der echten Funktion.
#
# Bug (AC): origin/main enthaelt (1) einen Feature-Squash-Commit
# `feat(foo): implement x [T009999]` und (2) einen NEUEREN Archiv-Commit
# `chore(plans): archive foo → bar [T009999]`. Die alte `--grep ... -1`-Logik
# traef den Archiv-Commit (beobachtet bei T008017: 673f14a48 statt
# Feature-Merge abda93f9a) — die Selektion MUSS den Feature-Commit liefern.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/devflow-post-merge-deploy.sh"
  new_test_repo archive
}

teardown() {
  if [ -n "${TEST_REPO:-}" ] && [ -d "$TEST_REPO" ]; then
    rm -rf "$TEST_REPO"
  fi
}

# Baut ein temp-Git-Repo: initial-Commit, Feature-Commit
# `feat(foo): implement x [T009999]` und — je nach Argument — einen NEUEREN
# Archiv-Commit `chore(plans): archive foo → bar [T009999]`. origin/main wird
# per update-ref direkt auf HEAD gesetzt (kein Remote noetig).
new_test_repo() {
  TEST_REPO="$(mktemp -d)"
  git -C "$TEST_REPO" init -q -b main
  git -C "$TEST_REPO" config user.email bats@test.local
  git -C "$TEST_REPO" config user.name "BATS Test"
  git -C "$TEST_REPO" config core.hooksPath /dev/null
  echo initial > "$TEST_REPO/README.md"
  git -C "$TEST_REPO" add README.md
  git -C "$TEST_REPO" commit -q -m "chore: initial"
  echo feature > "$TEST_REPO/README.md"
  git -C "$TEST_REPO" commit -q -am "feat(foo): implement x [T009999]"
  FEATURE_SHA="$(git -C "$TEST_REPO" rev-parse HEAD)"
  if [[ "${1:-archive}" == "archive" ]]; then
    mkdir -p "$TEST_REPO/openspec/changes/archive/foo"
    echo spec > "$TEST_REPO/openspec/changes/archive/foo/spec.md"
    git -C "$TEST_REPO" add openspec
    git -C "$TEST_REPO" commit -q -m "chore(plans): archive foo → bar [T009999]"
    ARCHIVE_SHA="$(git -C "$TEST_REPO" rev-parse HEAD)"
  else
    ARCHIVE_SHA=""
  fi
  git -C "$TEST_REPO" update-ref refs/remotes/origin/main HEAD
}

# AC-Hauptfall: der neueste Commit mit [T009999] im Subject ist der Archiv-
# Commit — die Selektion muss trotzdem den Feature-Commit liefern.
@test "T009368: Selektion liefert Feature-Merge-Commit statt neuerem Archiv-Commit" {
  # Gegenprobe (Positiv-Anker der Fehlerbedingung): die alte ungefilterte
  # `--grep -1`-Logik traefe im Fixture den Archiv-Commit — ohne den Fix waere
  # die AC-Aussage unten rot.
  run git -C "$TEST_REPO" log origin/main --format="%H %s" --grep='\[T009999\]' -1
  [ "$status" -eq 0 ]
  [[ "$output" == "$ARCHIVE_SHA"* ]]

  run bash -c "source '$SCRIPT' && select_merge_commit '$TEST_REPO' 'T009999'"
  [ "$status" -eq 0 ]
  [ "$output" = "$FEATURE_SHA" ]
}

# Negativfall: keine Ticket-ID auf origin/main → das Skript endet mit Exit 3.
# Positiv-Anker (T002356-M1): zuerst pruefen, dass die Selektionslogik fuer die
# vorhandene ID einen Commit liefert — sonst bestuende der Test vakuos.
@test "T009368: unbekannte Ticket-ID → Exit 3, kein Deploy-Lauf" {
  run bash -c "source '$SCRIPT' && select_merge_commit '$TEST_REPO' 'T009999'"
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  run bash -c "cd '$TEST_REPO' && bash '$SCRIPT' T009998"
  [ "$status" -eq 3 ]
  [[ "$output" == *"Kein Merge-Commit"* ]]
}

# Gegenprobe zum Negativfilter: ein Feature-Commit ohne Archiv-Nachfolger wird
# weiterhin gefunden — der Archiv-Filter darf keine Feature-Commits ausschliessen.
@test "T009368: Feature-Commit ohne Archiv-Nachfolger wird weiterhin gefunden" {
  new_test_repo no
  run bash -c "source '$SCRIPT' && select_merge_commit '$TEST_REPO' 'T009999'"
  [ "$status" -eq 0 ]
  [ "$output" = "$FEATURE_SHA" ]
}
