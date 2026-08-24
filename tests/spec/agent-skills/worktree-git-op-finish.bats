#!/usr/bin/env bats
# tests/spec/agent-skills/worktree-git-op-finish.bats [T015784]
#
# PRUEFMODUS: Output-Verifikation. Jeder Test fuehrt
# scripts/worktree-git-op-guard.sh gegen ein echtes Fixture-Repo aus und prueft
# Exit-Code und den tatsaechlichen Zustand danach (Zustandsverzeichnis, Refs) —
# kein Source-Grep.
#
# HINTERGRUND (T015784): Im repo-hygiene-Lauf vom 2026-08-24 stand
# .worktrees/openspec-closure-guard-spec-T015670 mitten in einem Rebase, dessen
# Konflikte alle geloest und dessen Kommandos alle abgearbeitet waren — nur
# `git rebase --continue` fehlte. PR #5191 stand deshalb auf DIRTY und
# blockierte, obwohl `git merge-tree --write-tree origin/main` lokal mit rc=0
# meldete. Der Guard erkannte den Zustand und benannte ihn genau; abgeraeumt hat
# ihn niemand.
#
# Der Default-Aufruf repariert weiterhin nichts (Szenario "Der Guard repariert
# nichts" in worktree-mid-rebase-guard.bats bleibt unveraendert gueltig). Nur das
# opt-in --finish handelt, und nur in der Schnittmenge, in der dabei KEIN neuer
# Inhalt entsteht.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/worktree-git-op-guard.sh"
  FIXTURE="$BATS_TEST_TMPDIR/fixture"
}

# Wie in worktree-mid-rebase-guard.bats: Repo mit linked worktree.
#   --mid-rebase          Rebase unterbrochen, Konflikt GELOEST und gestaged
#                         (der maschinell abschliessbare Fall)
#   --mid-rebase-conflict Rebase unterbrochen, Konflikt OFFEN
#   --mid-merge           Merge unterbrochen (MERGE_HEAD vorhanden)
_make_fixture() {
  local mode="${1:-clean}"
  rm -rf "$FIXTURE"
  mkdir -p "$FIXTURE"
  git -C "$FIXTURE" init -q -b main .
  git -C "$FIXTURE" config user.email t@example.invalid
  git -C "$FIXTURE" config user.name "T"
  mkdir -p "$FIXTURE/components/website/src/data"
  echo base > "$FIXTURE/components/website/src/data/openspec-status.json"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit -qm base
  git -C "$FIXTURE" branch feat
  echo mainside > "$FIXTURE/components/website/src/data/openspec-status.json"
  git -C "$FIXTURE" commit -qam mainside

  WT="$BATS_TEST_TMPDIR/wt"
  rm -rf "$WT"
  git -C "$FIXTURE" worktree add -q "$WT" feat
  [ "$mode" = "clean" ] && return 0

  echo feat > "$WT/components/website/src/data/openspec-status.json"
  git -C "$WT" commit -qam feat

  case "$mode" in
    --mid-rebase)
      git -C "$WT" rebase main >/dev/null 2>&1 || true
      echo resolved > "$WT/components/website/src/data/openspec-status.json"
      git -C "$WT" add components/website/src/data/openspec-status.json
      ;;
    --mid-rebase-conflict)
      git -C "$WT" rebase main >/dev/null 2>&1 || true
      # Konfliktmarker bleiben stehen — nichts wird aufgeloest.
      ;;
    --mid-merge)
      git -C "$WT" merge main >/dev/null 2>&1 || true
      ;;
  esac
}

_rebase_dir() { git -C "$WT" rev-parse --git-path rebase-merge 2>/dev/null; }

# Positiv-Anker (T002356-M1): --finish wird als Option ueberhaupt angenommen.
# Ohne diesen Anker bestuenden die Negativtests unten vakuos — ein Guard, der
# --finish mit Usage-Fehler abweist, fasst trivial nichts an.
@test "T015784: --finish auf einem sauberen Fixture endet mit Exit 0" {
  _make_fixture
  run bash "$GUARD" --finish "$FIXTURE"
  [ "$status" -eq 0 ]
}

@test "T015784: --finish schliesst den geloesten Rebase ab (Zustandsverzeichnis verschwindet)" {
  _make_fixture --mid-rebase
  state="$(_rebase_dir)"
  [ -d "$state" ]
  run bash "$GUARD" --finish "$FIXTURE"
  [ "$status" -eq 0 ]
  [ ! -d "$state" ]
}

# Der Abschluss ist erst belegt, wenn der Branch-Ref das Ergebnis auch traegt.
# `git rebase --continue` wurde mit rc=0 UND `error: update_ref failed`
# beobachtet — der Exit-Code taugt deshalb nicht als Urteil.
@test "T015784: nach --finish zeigt der Branch-Ref auf denselben Commit wie HEAD" {
  _make_fixture --mid-rebase
  run bash "$GUARD" --finish "$FIXTURE"
  [ "$status" -eq 0 ]
  head_sha="$(git -C "$WT" rev-parse HEAD)"
  branch_sha="$(git -C "$WT" rev-parse feat)"
  [ "$head_sha" = "$branch_sha" ]
}

@test "T015784: --finish fasst einen Rebase mit offenen Konflikten nicht an" {
  _make_fixture --mid-rebase-conflict
  state="$(_rebase_dir)"
  [ -d "$state" ]
  run bash "$GUARD" --finish "$FIXTURE"
  [ "$status" -ne 0 ]
  [ -d "$state" ]
}

@test "T015784: --finish fasst einen unterbrochenen Merge nicht an" {
  _make_fixture --mid-merge
  merge_head="$(git -C "$WT" rev-parse --git-path MERGE_HEAD)"
  [ -f "$merge_head" ]
  run bash "$GUARD" --finish "$FIXTURE"
  [ "$status" -ne 0 ]
  [ -f "$merge_head" ]
}

# Die Default-Zusage bleibt: ohne --finish wird nichts angefasst. Dieser Test
# steht bewusst auch hier und nicht nur in worktree-mid-rebase-guard.bats — er
# ist die Grenze, die --finish nicht verschieben darf.
@test "T015784: ohne --finish bleibt der Rebase-Zustand unveraendert bestehen" {
  _make_fixture --mid-rebase
  state="$(_rebase_dir)"
  run bash "$GUARD" "$FIXTURE"
  [ "$status" -ne 0 ]
  [ -d "$state" ]
}
