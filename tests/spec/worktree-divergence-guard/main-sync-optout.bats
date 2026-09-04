#!/usr/bin/env bats
# tests/spec/worktree-divergence-guard/main-sync-optout.bats [T900043/Befund 4]
#
# PRÜFMODUS: Output-Verifikation. Jeder Test baut ein echtes Repo-Paar (bare
# origin + Klon), legt "local main behind origin/main" und ruft
# `scripts/worktree-create.sh` als Kommando auf. Kein Source-Grep — das Verhalten
# (main-SHA bewegt/unbewegt, Exit-Code, Meldung) ist direkt beobachtbar.
#
# HINTERGRUND: Der Auto-Sync (`git pull --rebase origin main`, worktree-create.sh)
# mutierte den lokalen `main` ohne Ankündigung und ohne Opt-out — belegt per Reflog
# `pull --rebase (finish): refs/heads/main onto …` (2026-09-02, direkt nach zwei
# lokalen [T000000]-Commits im Haupt-Checkout). In `devflow-post-merge-finalize.sh`
# und `branch-reaper.sh` steht KEIN pull/rebase (grep-verifiziert) — der Auto-Sync
# ist der einzige Skript-Ort. Vertrag nach dem Fix: dirty Baum → fail-closed
# Abbruch; clean Baum → Ankündigung VOR dem Sync; `DEVFLOW_NO_MAIN_SYNC=1` oder
# `--no-main-sync` → kein main-Touch, Lauf geht idempotent weiter.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-create.sh"
  ORIGIN="${BATS_TEST_TMPDIR}/origin.git"
  CLONE="${BATS_TEST_TMPDIR}/clone"

  git init -q --bare -b main "$ORIGIN"
  git clone -q "$ORIGIN" "$CLONE"
  cd "$CLONE" || return 1
  git config user.email "test@example.invalid"
  git config user.name "Test"
  git config commit.gpgsign false

  echo "basis" > shared.txt
  git add shared.txt
  git commit -qm "base"
  git branch -M main
  git push -q origin main

  # origin/main einen Commit vorausbringen → local main liegt zurück.
  local upstream="${BATS_TEST_TMPDIR}/upstream"
  git clone -q -b main "$ORIGIN" "$upstream"
  git -C "$upstream" config user.email "test@example.invalid"
  git -C "$upstream" config user.name "Test"
  git -C "$upstream" config commit.gpgsign false
  echo "remote-voraus" > "$upstream/shared.txt"
  git -C "$upstream" commit -qam "remote voraus"
  git -C "$upstream" push -q origin main

  git fetch -q origin
}

# Positiv-Anker (T002356-M1): Der Normalfall (clean, kein Opt-out) muss den Sync
# durchlaufen und einen nutzbaren Worktree liefern — sonst wären die
# Negativ-Aussagen unten vakuos (ein Skript, das nie synct, bestünde sie trivial).
@test "worktree-create: cleaner Baum ohne Opt-out synct main und liefert ready" {
  BEFORE="$(git rev-parse main)"
  ORIGIN_SHA="$(git rev-parse origin/main)"
  [ "$BEFORE" != "$ORIGIN_SHA" ]

  run bash "$SCRIPT" fix/clean-probe-T000002 "${BATS_TEST_TMPDIR}/wt-clean"

  [ "$status" -eq 0 ]
  [[ "$output" == *"ready on"* ]]
  AFTER="$(git rev-parse main)"
  [ "$AFTER" == "$ORIGIN_SHA" ]
}

@test "worktree-create: DEVFLOW_NO_MAIN_SYNC=1 laesst main unberuehrt, Lauf geht weiter" {
  BEFORE="$(git rev-parse main)"

  run env DEVFLOW_NO_MAIN_SYNC=1 bash "$SCRIPT" fix/optout-probe-T000002 "${BATS_TEST_TMPDIR}/wt-optout"

  [ "$status" -eq 0 ]
  [[ "$output" == *"ready on"* ]]
  AFTER="$(git rev-parse main)"
  [ "$AFTER" == "$BEFORE" ]
  echo "$output" | grep -qF "DEVFLOW_NO_MAIN_SYNC"
}

@test "worktree-create: --no-main-sync laesst main unberuehrt, Lauf geht weiter" {
  BEFORE="$(git rev-parse main)"

  run bash "$SCRIPT" --no-main-sync fix/flag-probe-T000002 "${BATS_TEST_TMPDIR}/wt-flag"

  [ "$status" -eq 0 ]
  [[ "$output" == *"ready on"* ]]
  AFTER="$(git rev-parse main)"
  [ "$AFTER" == "$BEFORE" ]
}

@test "worktree-create: dirty Baum bricht fail-closed ab statt still zu syncen" {
  BEFORE="$(git rev-parse main)"
  echo "lokal-dirty" > shared.txt
  ! git diff --quiet HEAD

  run bash "$SCRIPT" fix/dirty-probe-T000002 "${BATS_TEST_TMPDIR}/wt-dirty"

  [ "$status" -ne 0 ]
  # Kein main-Touch …
  AFTER="$(git rev-parse main)"
  [ "$AFTER" == "$BEFORE" ]
  # … dirty Inhalt intakt …
  grep -qF "lokal-dirty" shared.txt
  # … und kein Auto-Stash liegengeblieben.
  [ -z "$(git stash list)" ]
}
