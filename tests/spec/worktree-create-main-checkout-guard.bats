#!/usr/bin/env bats
# tests/spec/worktree-create-main-checkout-guard.bats
# T007067 Mishap 1 — worktree-create.sh legt bei Fremdbranch im Hauptcheckout
# Worktree auf falschem Branch an.
#
# Referenz: T002448-M1 (tests/spec/mishap-bundle-infra-testspec-ci.bats) prueft
# den pwd-relativen Fall ("Skript im Haupt-Checkout auf nicht-main Branch").
# Dieser Test deckt den Luecken-Fall ab: worktree-create.sh wird AUS EINEM
# WORKTREE heraus aufgerufen (Factory-Dispatch-Muster, pipeline.mjs), waehrend
# das eigentliche Haupt-Checkout (git-common-dir-Elternverzeichnis) auf einem
# fremden Branch steht. pwd-relatives HEAD ist dann der Worktree-Branch (z.B.
# "main") — der Guard sieht "main" und laesst den Fremdbranch durch. [T007067]

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-create.sh"
  TMPDIR_BASE="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMPDIR_BASE"
}

# T007067-M1: Bei Fremdbranch im HAUPT-CHECKOUT muss worktree-create.sh auch
# dann fail-closed abbrechen, wenn es aus einem Worktree auf branch "main"
# heraus aufgerufen wird. Der pwd-relative T002448-M1-Guard verpasst genau
# diesen Fall: git rev-parse --abbrev-ref HEAD loest im Aufruf-Worktree auf.
# expected: FAIL (RED) — aktuell legt das Skript den Worktree an (exit 0)
@test "T007067-M1: worktree-create.sh fail-closed bei Fremdbranch im Haupt-Checkout (Aufruf aus Worktree)" {
  [ -f "$SCRIPT" ]

  local repo="$TMPDIR_BASE/repo"
  local wt_dir="$TMPDIR_BASE/wt-on-main"
  local out_wt="$TMPDIR_BASE/out-wt"

  git init -q -b main "$repo"
  git -C "$repo" config user.email "test@test"
  git -C "$repo" config user.name "Test"
  git -C "$repo" commit -q --allow-empty -m "initial on main"

  # origin/main anlegen, damit die Guards (origin/main-Vorbedingung) greifen.
  git -C "$repo" update-ref refs/remotes/origin/main main

  # Haupt-Checkout auf Fremdbranch stellen (Parallelsession-Szenario).
  git -C "$repo" checkout -q -b chore/foreign-T999999
  git -C "$repo" commit -q --allow-empty -m "on foreign branch"

  # Zweites Worktree auf branch "main" — pwd-relative HEAD waere dort "main".
  git -C "$repo" worktree add -q "$wt_dir" main

  # Aufruf AUS dem main-Worktree heraus (Factory-Muster). Der echte
  # Haupt-Checkout steht auf chore/foreign-T999999 → fail-closed erwartet.
  run bash -c "cd '$wt_dir' && bash '$SCRIPT' feature/foo-T999998 '$out_wt' origin/main"

  # RED: aktuell exit 0 (Guard prueft Worktree-HEAD="main" und laesst durch),
  # der Fremdbranch im Haupt-Checkout wird uebersehen.
  [ "$status" -ne 0 ]
  [[ "$output" == *"main"* ]]
  [ ! -d "$out_wt/.git" ] || [ ! -d "$out_wt" ]
}
