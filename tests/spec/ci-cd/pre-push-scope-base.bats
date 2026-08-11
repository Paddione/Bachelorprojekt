#!/usr/bin/env bats
# tests/spec/ci-cd/pre-push-scope-base.bats [T002827]
#
# PRÜFMODUS: Output-Verifikation. Jeder Test legt ein echtes temporäres Git-Repo
# an und ruft `scripts/hooks/pre-push-scope-base.sh` als Kommando auf. Geprüft
# werden dessen stdout und Exit-Status — nicht der Quelltext des Skripts.
#
# HINTERGRUND: .githooks/pre-push berechnete die Scope-Prüf-Basis als
# `origin/main`-Ref-Stand (oder REMOTE_SHA). Nach einem `git rebase origin/main`
# (Standardweg für CONFLICTING-PRs) zog "origin/main..LOCAL_SHA" bereits
# gemergte main-Commits in die Prüfung und blockte den Push mit fremden
# Commit-Messages [T002104-Folgebefund, T002827; real bei
# fix/ticket-list-test-data-filter-T002781]. Der Helper bestimmt den echten
# Fork-Point per `merge-base --fork-point` über die origin/main-Reflog und
# liefert damit eine Base, deren Range nur die eigenen Branch-Commits enthält.
#
# Kernregression dieses Tests: nach einem Rebase enthält `BASE..HEAD` die
# gemergten main-Commits NICHT mehr — die Aufgabe, die der Hook früher mit dem
# stale origin/main-Ref-Stand verfehlte.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/hooks/pre-push-scope-base.sh"
  VALIDATE="${REPO_ROOT}/scripts/validate-commit-msg.sh"
  TESTREPO="${BATS_TEST_TMPDIR}/repo"
  REMOTE_REPO="${BATS_TEST_TMPDIR}/remote"

  mkdir -p "$TESTREPO" "$REMOTE_REPO"
  # Echte Remote: ein bare-Repo, aus dem der Testclone fetcht. Nur so existiert
  # ein echter refs/remotes/origin/main mit Reflog, den merge-base --fork-point
  # auswerten kann (T002827).
  git init -q --bare "$REMOTE_REPO"
  git init -q -b main "$TESTREPO"
  cd "$TESTREPO" || return 1
  git config user.email "test@example.invalid"
  git config user.name "Test"
  git config commit.gpgsign false
  git remote add origin "$REMOTE_REPO"
}

_commit() {
  local subject="$1"
  local fname
  fname="$(echo "$subject" | tr -cd '[:alnum:]' | cut -c1-20)"
  echo "$subject" > "file_${fname}.txt"
  git add "file_${fname}.txt"
  git commit -qm "$subject"
  git rev-parse HEAD
}

# Pusht main zum Remote und holt den Reflog der remote-tracking Ref nach.
_seed_remote() {
  git push -q -u origin main 2>/dev/null
  git fetch -q origin main
}

@test "pre-push-scope-base.sh exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "T002827: Helper ignoriert einen nicht-ancestor REMOTE_SHA nach Rebase" {
  # Der eigentliche T002827-Fall: nach `git rebase origin/main` liegt der alte
  # Remote-Branch-Tip (REMOTE_SHA, was der Hook als zweiten Parameter uebergibt)
  # NICHT mehr auf der Ahnenlinie des neuen HEAD. Der Helper darf ihn dann NICHT
  # als Basis nehmen — "REMOTE_SHA..LOCAL_SHA" zoege bereits gemergte main-Commits
  # in die Scope-Pruefung [T002104-Folgebefund, T002827].
  _commit "chore: initial main [T000000]"
  _seed_remote
  git checkout -q -b feature/test-branch
  _commit "feat(ops): branch commit [T002827]"
  local old_remote_sha
  old_remote_sha="$(git rev-parse HEAD)"

  # Remote-main rueckt vor; Branch wird auf den neuen Stand rebased (der alte
  # Branch-Tip old_remote_sha ist danach kein Ancestor des neuen HEAD mehr).
  git checkout -q main
  _commit "feat(ci): main-only commit [T000000]"
  git push -q origin main
  git fetch -q origin main
  git checkout -q feature/test-branch
  git rebase -q origin/main
  local head_sha
  head_sha="$(git rev-parse HEAD)"

  # Der Helper bekommt genau die Argumente, die .githooks/pre-push uebergibt.
  local base
  base="$(bash "$SCRIPT" "$head_sha" "$old_remote_sha")"
  [ -n "$base" ]
  [ "$base" != "$old_remote_sha" ]

  # Die Range base..HEAD darf NUR den Branch-Commit enthalten — kein main-Only-Commit.
  local range_subjects
  range_subjects="$(git log --no-merges --format='%s' "$base..HEAD")"
  [[ "$range_subjects" == "feat(ops): branch commit [T002827]" ]]

  # Gegenprobe: wuerde der Helper auf REMOTE_SHA fallen, zoege die Range den
  # main-Only-Commit mit (das ist die T002104/T002827-Fehlklassifikation).
  local polluted
  polluted="$(git log --no-merges --format='%s' "$old_remote_sha..$head_sha" 2>/dev/null)"
  [[ "$polluted" == *"main-only commit"* ]]
}

@test "T002827: validate-commit-msg.sh commits-Modus validiert explizite SHAs" {
  # Der commits-Modus laeuft gegen das echte Repo (repo_root wird aus BASH_SOURCE
  # abgeleitet) — hier also einen echten Commit aus dem Hauptrepo pruefen.
  local sha
  sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  [ -n "$sha" ]

  run bash "$VALIDATE" commits "$sha"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}

@test "T002827: commits-Modus ohne SHAs ist ein Usage-Fehler" {
  run bash "$VALIDATE" commits
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage"* ]]
}

@test "usage error on missing head-sha" {
  run bash "$SCRIPT"
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage"* ]]
}

@test "Fork-Point-Base ist ein Ancestor von HEAD" {
  _commit "chore: initial main [T000000]"
  _seed_remote
  git checkout -q -b feature/test-branch
  _commit "feat(ops): branch commit [T002827]"

  local base
  base="$(bash "$SCRIPT" "$(git rev-parse HEAD)")"

  git merge-base --is-ancestor "$base" HEAD
  [ "$?" -eq 0 ]
}
