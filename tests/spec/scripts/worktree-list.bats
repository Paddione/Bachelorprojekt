#!/usr/bin/env bats
# tests/spec/scripts/worktree-list.bats
#
# Prüfmodus: überwiegend command output verification — `worktree-list.sh` wird
# gegen ein echtes Wegwerf-Repo mit echtem `git worktree add` AUSGEFÜHRT und
# seine Ausgabe geprüft. Der letzte Test ist bewusst ein Konfigurations-Guard
# (grep): dass zwei Konfigurationsstellen denselben Pfad nennen, manifestiert
# sich ausschließlich im Quelltext — die dokumentierte Ausnahme der
# Test-Resultats-Konvention.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-list.sh"

  # Wegwerf-Repo: eigener Objektspeicher, kein git-crypt, keine Hooks des
  # Hauptrepos — der Test misst die Ableitung, nicht die Repo-Ausstattung.
  TMP="$(mktemp -d)"
  MAIN="$TMP/main"
  git init -q "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name Test
  git -C "$MAIN" commit -q --allow-empty -m init
  git -C "$MAIN" branch -M main
}

teardown() {
  [ -n "${TMP:-}" ] && rm -rf "$TMP"
}

@test "worktree-list.sh listet den Haupt-Checkout und einen angelegten Worktree" {
  # Positiv-Anker zuerst: ohne zweiten Worktree steht der Haupt-Checkout da.
  run bash -c "cd '$MAIN' && bash '$SCRIPT'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"$MAIN"* ]]

  git -C "$MAIN" worktree add -q -b feature/probe "$MAIN/.worktrees/probe" main

  run bash -c "cd '$MAIN' && bash '$SCRIPT'"
  [ "$status" -eq 0 ]
  # Der neue Worktree erscheint mit seinem Branch — das ist die Zusicherung.
  probe_line="$(printf '%s\n' "$output" | grep -F '.worktrees/probe')"
  [ -n "$probe_line" ]
  [[ "$probe_line" == *"feature/probe"* ]]
}

@test "worktree-list.sh --json gibt beide Worktrees als Einträge aus" {
  git -C "$MAIN" worktree add -q -b feature/probe "$MAIN/.worktrees/probe" main

  run bash -c "cd '$MAIN' && bash '$SCRIPT' --json"
  [ "$status" -eq 0 ]

  # Semantik statt Darstellung: geprüft wird, dass beide Pfade als JSON-Werte
  # vorkommen, nicht das Einrücken oder die Feldreihenfolge.
  [[ "$output" == *"\"path\": \"$MAIN\""* ]]
  [[ "$output" == *"\"path\": \"$MAIN/.worktrees/probe\""* ]]
  [[ "$output" == *"\"branch\": \"feature/probe\""* ]]
}

@test "worktree-list.sh --all bleibt ohne Cluster-Zugang erfolgreich und meldet den Grund" {
  # Ein unerreichbarer Factory-Pod darf die lokale Menge nicht entwerten:
  # rc=0, lokale Zeilen vorhanden, Grund benannt.
  run bash -c "cd '$MAIN' && FACTORY_CTX=does-not-exist bash '$SCRIPT' --all"
  [ "$status" -eq 0 ]
  [[ "$output" == *"$MAIN"* ]]
  [[ "$output" == *"nicht erhoben"* ]]
}

@test "worktree-list.sh meldet ausserhalb eines Git-Repos einen Umgebungsfehler" {
  run bash -c "cd '$TMP' && bash '$SCRIPT'"
  [ "$status" -eq 2 ]
}

@test "opencode worktreePath stimmt mit dem von preflight-pr-scope erzwungenen Pfad ueberein" {
  # Drift-Guard: .opencode/worktree.jsonc legt Worktrees an, preflight-pr-scope.sh
  # verweigert den PR, wenn sie woanders liegen. Gehen die beiden auseinander,
  # erzeugt opencode Worktrees, aus denen kein PR entstehen kann.
  oc_path="$(sed -n 's/.*"worktreePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
             "$REPO_ROOT/.opencode/worktree.jsonc" | head -1)"
  # Positiv-Anker: der Wert wurde überhaupt gelesen.
  [ -n "$oc_path" ]
  [ "$oc_path" = ".worktrees" ]

  run grep -e "/${oc_path}/" "$REPO_ROOT/scripts/preflight-pr-scope.sh"
  [ "$status" -eq 0 ]
}
