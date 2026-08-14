#!/usr/bin/env bats
# tests/spec/worktree-create-real-path-T004604.bats
#
# [T004604] worktree-create.sh legte am 2026-08-14 den Worktree unter
# `.worktrees/batch-worktree-guard-tooling-fixes-T004295` an (Ticket-Suffix),
# waehrend die Skript-Ausgabe den uebergebenen Pfad OHNE Suffix meldete —
# die Pfad-Drift-Quelle aus T003991 (Lock zeigt auf Pfad A, realer Worktree
# heisst B). Ob der Suffix vom create-Skript oder einem parallelen Aufrufer
# stammt: die Drift darf nie wieder STILL bleiben.
#
# Fix: nach dem Anlegen verifiziert das Skript den REALEN Pfad aus
# `git worktree list --porcelain` (Funktion `worktree_real_path`) und meldet
# bei Abweichung vom uebergebenen Pfad eine Warnung plus den realen Pfad in
# der Abschlusszeile.
#
# Pruefmodus: OUTPUT-Verifikation der reinen Funktion gegen ein lokales
# git-Fixture + Guard-Grep auf die Abweichungs-Warnung im Skript.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-create.sh"
  LIB="$REPO_ROOT/scripts/lib/worktree-real-path.sh"
}

# ── Reine Funktion: realer Pfad aus git worktree list ─────────────────────

@test "T004604-M1: worktree_real_path liefert den registrierten Pfad eines Worktrees" {
  [ -f "$LIB" ] || skip "lib scripts/lib/worktree-real-path.sh existiert noch nicht (Rot-Phase)"
  WORK="$(mktemp -d)"
  (
    cd "$WORK"
    git init -q main
    git -C main config user.email t@t
    git -C main config user.name t
    echo x > main/f
    git -C main add f
    git -C main commit -qm init
    git -C main worktree add -q wt-a -b branch-a
  )
  run bash -c "
    source '$LIB'
    worktree_real_path '$WORK/main' '$WORK/main/wt-a'
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"wt-a"* ]]
  rm -rf "$WORK"
}

@test "T004604-M2: worktree_real_path gibt leeren Output fuer nicht registrierte Pfade" {
  [ -f "$LIB" ] || skip "lib scripts/lib/worktree-real-path.sh existiert noch nicht (Rot-Phase)"
  WORK="$(mktemp -d)"
  (
    cd "$WORK"
    git init -q main
    git -C main config user.email t@t
    git -C main config user.name t
    echo x > main/f
    git -C main add f
    git -C main commit -qm init
  )
  run bash -c "
    source '$LIB'
    worktree_real_path '$WORK/main' '$WORK/main/ghost'
  "
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  rm -rf "$WORK"
}

# ── Guard-Grep: Abweichungs-Warnung im create-Skript ─────────────────────

@test "T004604-M3: create-Skript warnt bei Abweichung zwischen uebergebenem und realem Pfad" {
  [ -f "$SCRIPT" ]
  run grep -qE 'realer Pfad|real path|weicht ab|worktree_real_path' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T004604-M4: Abschlussmeldung nennt den realen Pfad (nicht nur den uebergebenen)" {
  [ -f "$SCRIPT" ]
  # ready-Meldung soll den verifizierten realen Pfad ausgeben
  run grep -qE 'ready.*worktree_real_path|ready.*REAL_WT|ready.*realen Pfad' "$SCRIPT"
  [ "$status" -eq 0 ]
}
