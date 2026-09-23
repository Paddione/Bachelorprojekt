#!/usr/bin/env bats
# tests/spec/agent-skills/worktree-remove-managed.bats
# SSOT: openspec/specs/agent-skills.md
#   "Removal of managed worktrees unlocks before removing" (T900340)
#
# PRUEFMODUS: Output-Verifikation (T002448-M4) fuer Helper und finalize-Schritt 10:
# beide werden gegen ein Sandbox-Repo mit gesperrtem Worktree AUSGEFUEHRT. Der
# Schritt-10-Block wird per Bereichsmuster (nicht Zeilennummer, T003104) aus dem
# Skript geschnitten. Der letzte Test ist eine dokumentierte Source-Grep-Ausnahme
# (Konventions-Guard ueber die Aufrufer), mit Positiv-Anker pro Datei.
#
# Defekt: worktree-create.sh sperrt jeden Worktree (T900046); `git worktree remove
# --force` verweigert gesperrte Worktrees mit exit 128.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-remove-managed.bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO_ROOT/scripts/lib/worktree-remove.sh"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  SANDBOX="$BATS_TEST_TMPDIR/repo"
  export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid
  export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
  mkdir -p "$SANDBOX"
  git -C "$SANDBOX" init -q .
  git -C "$SANDBOX" commit -q --allow-empty -m init
}

_locked_wt() {
  git -C "$SANDBOX" worktree add -q -b "$2" "$1"
  git -C "$SANDBOX" worktree lock "$1" --reason "managed agent worktree"
}

_registered() { git -C "$SANDBOX" worktree list --porcelain | grep -qxF "worktree $1"; }

@test "T900340: gesperrter Worktree wird vom Helper entfernt" {
  local wt="$SANDBOX/.worktrees/locked1"
  _locked_wt "$wt" b-locked1
  run bash -c "source '$LIB' && worktree_remove_managed '$SANDBOX' '$wt'"
  [ "$status" -eq 0 ]
  [ ! -e "$wt" ]
  run _registered "$wt"
  [ "$status" -ne 0 ]
}

@test "T900340: ungesperrter Worktree wird ebenfalls entfernt" {
  local wt="$SANDBOX/.worktrees/plain1"
  git -C "$SANDBOX" worktree add -q -b b-plain1 "$wt"
  run bash -c "source '$LIB' && worktree_remove_managed '$SANDBOX' '$wt'"
  [ "$status" -eq 0 ]
  [ ! -e "$wt" ]
}

@test "T900340: nicht registrierter Pfad wird abgewiesen und bleibt stehen" {
  local dir="$SANDBOX/.worktrees/fremd"
  mkdir -p "$dir"
  # Positiv-Anker (T002356-M1): der Helper existiert und ist aufrufbar — sonst
  # waere "exit != 0" schon durch das scheiternde source erfuellt.
  run bash -c "source '$LIB' && declare -F worktree_remove_managed"
  [ "$status" -eq 0 ]
  run bash -c "source '$LIB' && worktree_remove_managed '$SANDBOX' '$dir'"
  [ "$status" -ne 0 ]
  [ -d "$dir" ]
}

@test "T900340: finalize-Schritt 10 entfernt einen gesperrten Worktree" {
  local wt="$SANDBOX/.worktrees/final1"
  _locked_wt "$wt" b-final1
  local block
  block="$(awk '
    /^  if .*worktree[ _]remove/ { inside = 1 }
    inside                       { print }
    inside && /^  fi$/           { exit }
  ' "$FINALIZE")"
  [ -n "$block" ]
  run bash -c "
    set -uo pipefail
    [ -f '$LIB' ] && source '$LIB'
    mark_ok() { echo \"OK: \$*\"; }
    REPO_DIR='$SANDBOX' WORKTREE='$wt'
    $block
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"Schritt 10: Worktree"* ]]
  [ ! -e "$wt" ]
}

@test "T900340: Aufrufer entfernen Worktrees nur ueber den Helper" {
  local f bare
  for f in scripts/devflow-post-merge-finalize.sh scripts/pr-refresh.sh \
           scripts/weekly-dep-schema-audit.sh scripts/factory/cleanup.sh; do
    # Positiv-Anker (T002356-M1): die Datei nutzt den Helper ueberhaupt.
    grep -qF 'worktree_remove_managed' "$REPO_ROOT/$f"
    # Keine ausfuehrbare Zeile mit nacktem `worktree remove` (Kommentare und
    # Meldungstexte in echo ausgenommen).
    bare="$(grep -nE 'worktree remove' "$REPO_ROOT/$f" | grep -vE '^[0-9]+:[[:space:]]*#' | grep -vE '^[0-9]+:[[:space:]]*echo ' || true)"
    [ -z "$bare" ] || { echo "$f: $bare"; false; }
  done
}
