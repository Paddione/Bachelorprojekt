#!/usr/bin/env bats
# SA-branch-reaper-netzausfall-T012967
# branch-reaper.sh soll bei Netzfehler (git ls-remote rc != 0) einen Fehler
# melden und mit rc != 0 beenden, statt "Keine Remote-Branches gefunden" auszugeben.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  REAPER="$REPO/scripts/branch-reaper.sh"
}

@test "branch-reaper exits non-zero when git ls-remote fails (network error)" {
  # Run branch-reaper with a mock that makes git ls-remote return rc=1
  run bash -c '
    # Override git to make ls-remote fail
    git() {
      if [[ "$1" == "ls-remote" ]]; then
        echo "fatal: unable to access" >&2
        return 1
      fi
      command git "$@"
    }
    export -f git
    export REPO="'"$REPO"'"
    bash "'"$REAPER"'" --sweep --dry-run 2>&1
  '
  # Must NOT exit 0 — a network error is not "no branches found"
  [ "$status" -ne 0 ]
  # Must NOT claim success
  [[ "$output" != *"Keine Remote-Branches gefunden"* ]]
}

@test "branch-reaper still succeeds when git ls-remote returns 0 with no branches" {
  run bash -c '
    git() {
      if [[ "$1" == "ls-remote" ]]; then
        echo ""
        return 0
      fi
      command git "$@"
    }
    export -f git
    export REPO="'"$REPO"'"
    bash "'"$REAPER"'" --sweep --dry-run 2>&1
  '
  # Empty result with rc=0 is genuinely "no branches" — exit 0 is correct
  [ "$status" -eq 0 ]
  [[ "$output" == *"Keine Remote-Branches gefunden"* ]]
}
