#!/usr/bin/env bats
# tests/spec/divergence-guard/stash-drop-by-message.bats
# Prüfmodus: command output verification (T002448-M4) — das Kommando wird gegen ein
# Temp-Repo-Fixture AUSGEFÜHRT; geprüft werden Exit-Codes und die reale
# `git stash list`-Ausgabe. Kein Source-Grep.
#
# Regression T006298: Zwei aufeinanderfolgende `git stash drop`-Aufrufe löschten den
# falschen Eintrag, weil Indizes nach dem ersten Drop rutschen. Die Auflösung MUSS
# nachrichtenbasiert erfolgen (`drop --by-message <pattern>`), nie über stash@{N}.

setup() {
  TMP_DIR="$(mktemp -d)"
  git -C "$TMP_DIR" init -q
  git -C "$TMP_DIR" config user.email test@example.invalid
  git -C "$TMP_DIR" config user.name bats
  git -C "$TMP_DIR" config commit.gpgsign false
  echo base >"$TMP_DIR/f.txt"
  git -C "$TMP_DIR" add f.txt
  git -C "$TMP_DIR" commit -qm base
}

teardown() {
  rm -rf "$TMP_DIR"
}

# Drei Stashes mit Ticket-Messages anlegen; neuester zuerst in `git stash list`.
# Nach Aufruf: [0]=T006298 [1]=T004897 [2]=T005591
seed_stashes() {
  echo a >>"$TMP_DIR/f.txt" && git -C "$TMP_DIR" stash push -qm "T005591 first"
  echo b >>"$TMP_DIR/f.txt" && git -C "$TMP_DIR" stash push -qm "T004897 second"
  echo c >>"$TMP_DIR/f.txt" && git -C "$TMP_DIR" stash push -qm "T006298 third"
}

SCRIPT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)/scripts/git-stash-net.sh"

@test "drop --by-message entfernt genau den matchnden Eintrag (Positiv-Anker)" {
  seed_stashes

  cd "$TMP_DIR"
  run bash "$SCRIPT" drop --by-message 'T005591'

  [ "$status" -eq 0 ]
  output=$(git stash list)
  # Positiv-Anker: Der matchnde Eintrag ist weg.
  ! grep -q 'T005591' <<<"$output"
  # Negativ-Aussage mit Anker: Die NICHT-matchnden Einträge bleiben erhalten.
  grep -q 'T004897' <<<"$output"
  grep -q 'T006298' <<<"$output"
}

@test "zwei aufeinanderfolgende Drops per Message löschen je den richtigen Eintrag (T006298)" {
  seed_stashes

  cd "$TMP_DIR"
  run bash "$SCRIPT" drop --by-message 'T005591'
  [ "$status" -eq 0 ]
  run bash "$SCRIPT" drop --by-message 'T004897'
  [ "$status" -eq 0 ]

  # Nach beiden Drops bleibt nur noch der dritte Eintrag — die Indizes haben sich durch
  # die Drops verschoben, die Message-Auflösung ist davon unabhängig.
  output=$(git stash list)
  grep -q 'T006298' <<<"$output"
  ! grep -q 'T005591' <<<"$output"
  ! grep -q 'T004897' <<<"$output"
}

@test "mehrdeutiges Muster bricht ab, ohne etwas zu entfernen" {
  seed_stashes
  echo d >>"$TMP_DIR/f.txt" && git -C "$TMP_DIR" stash push -qm "WIP T006298 duplicate"

  cd "$TMP_DIR"
  before=$(git stash list)
  run bash "$SCRIPT" drop --by-message 'T006298'

  [ "$status" -eq 3 ]
  grep -q 'mehrdeutig' <<<"$output"
  [ "$(git stash list)" = "$before" ]
}

@test "Muster ohne Treffer schlägt fail-closed fehl und entfernt nichts" {
  seed_stashes

  cd "$TMP_DIR"
  before=$(git stash list)
  run bash "$SCRIPT" drop --by-message 'T999999'

  [ "$status" -eq 2 ]
  grep -q 'kein Stash-Eintrag' <<<"$output"
  [ "$(git stash list)" = "$before" ]
}
