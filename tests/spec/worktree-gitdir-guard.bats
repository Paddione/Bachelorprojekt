#!/usr/bin/env bats
# T900066: a missing linked-worktree .git file must stop a write before Git can fall back to main.
setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/lib/worktree-gitdir-guard.sh"
  FIXTURE="$BATS_TEST_TMPDIR/worktree-gitdir-guard"
  mkdir -p "$FIXTURE"
  git -C "$FIXTURE" init -q -b main
  git -C "$FIXTURE" config user.email test@example.invalid
  git -C "$FIXTURE" config user.name test
  echo base > "$FIXTURE/base.txt"; git -C "$FIXTURE" add base.txt; git -C "$FIXTURE" commit -qm base
  git -C "$FIXTURE" worktree add -q "$FIXTURE/linked" -b fix/T900066-guard
}
teardown() { rm -rf "$FIXTURE"; }
@test "T900066: accepts a registered linked worktree" {
  run bash -c "source '$GUARD'; worktree_validate_gitdir --worktree '$FIXTURE/linked' --command-name 'git commit'"
  [ "$status" -eq 0 ]
}
@test "T900066: rejects a deleted .git file before Git falls back to main" {
  rm "$FIXTURE/linked/.git"
  run bash -c "source '$GUARD'; worktree_validate_gitdir --worktree '$FIXTURE/linked' --command-name 'git commit'"
  [ "$status" -ne 0 ]; [[ "$output" == *"refusing to write"* ]]
}
@test "T900066: rejects an unregistered directory nested below main" {
  mkdir -p "$FIXTURE/unregistered"
  run bash -c "source '$GUARD'; worktree_validate_gitdir --worktree '$FIXTURE/unregistered' --command-name 'git commit'"
  [ "$status" -ne 0 ]; [[ "$output" == *".git' is missing"* ]]
}
