#!/usr/bin/env bats
# Korrektur-Vorschlag fuer Ticket-Typ-Praefixe ausserhalb der Branch-Allowlist [T002811]
#
# Pruefmodus: OUTPUT-Verifikation. Jeder Test ruft scripts/worktree-create.sh
# tatsaechlich auf und prueft Exit-Code, Dateisystem und die "Suggested:"-Zeile.
# Es wird NICHT die Allowlist im Quelltext gegreppt — ein Grep auf das Muster
# belegt nur, dass Text existiert, nicht dass der Guard sich so verhaelt.
#
# Hintergrund: refactor/sdlc-routes-remove-T002627 wurde abgelehnt (T002627),
# der Operator wich geraten auf feature/ aus. Die Allowlist bleibt bewusst bei
# vier Praefixen (siehe openspec/specs/divergence-guard.md); der Guard soll die
# konforme Alternative nennen statt sie erraten zu lassen.
#
# RED-Phase: Die Typ-Praefix-Abbildung existiert noch nicht. Die Vorschlags-Tests
# scheitern; der Positiv-Anker und die Nicht-Verbreiterungs-Tests laufen gruen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  HELPER="$REPO/scripts/worktree-create.sh"

  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  # Minimales Repo ohne origin/main: der Divergence-Guard (T001302) feuert dann
  # nicht, und der Namens-Guard laeuft isoliert. Gleiches Muster wie
  # tests/spec/divergence-guard/branch-name-guard.bats.
  MAIN="$TMP/main"
  mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name  Tester
  printf 'x\n' > "$MAIN/file.txt"
  git -C "$MAIN" add -A
  git -C "$MAIN" commit -qm init
}

teardown() { rm -rf "$TMP"; }

# Nur die Vorschlags-Zeile betrachten. Ein ungefilterter Vergleich gegen den
# gesamten stdout+stderr koennte ueber den in der Usage ausgegebenen $0-Pfad
# zufaellig matchen (CLAUDE.md, BATS-$output-Konvention).
suggested_line() {
  printf '%s\n' "$output" | grep 'Suggested:' || true
}

@test "T002811: konformer chore/-Branch laeuft durch (Positiv-Anker)" {
  # Positiv-Anker zuerst [T002356-M1]: ohne ihn bestuenden die folgenden
  # Negativ-Aussagen auch dann, wenn der Helper generell bricht.
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/sdlc-routes-remove-T002627 '$TMP/wt-anker' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-anker" ]
}

@test "T002811: refactor/ wird abgelehnt und schlaegt chore/ vor" {
  run bash -c "cd '$MAIN' && bash '$HELPER' refactor/sdlc-routes-remove-T002627 '$TMP/wt-refactor' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-refactor" ]
  [[ "$(suggested_line)" == *"chore/sdlc-routes-remove-T002627"* ]]
}

@test "T002811: perf/ schlaegt ebenfalls chore/ vor" {
  run bash -c "cd '$MAIN' && bash '$HELPER' perf/query-batching-T002811 '$TMP/wt-perf' HEAD"
  [ "$status" -ne 0 ]
  [[ "$(suggested_line)" == *"chore/query-batching-T002811"* ]]
}

@test "T002811: bug/ schlaegt fix/ vor" {
  run bash -c "cd '$MAIN' && bash '$HELPER' bug/pocket-id-retry-T002811 '$TMP/wt-bug' HEAD"
  [ "$status" -ne 0 ]
  [[ "$(suggested_line)" == *"fix/pocket-id-retry-T002811"* ]]
}

@test "T002811: die Abbildung verbreitert die Allowlist nicht — refactor/ entsteht nicht" {
  run bash -c "cd '$MAIN' && bash '$HELPER' refactor/sdlc-routes-remove-T002627 '$TMP/wt-widen' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-widen" ]
  run bash -c "cd '$MAIN' && git branch --list 'refactor/*'"
  [ -z "$output" ]
}

@test "T002811: unbekanntes Praefix bekommt keinen Praefix-Vorschlag" {
  run bash -c "cd '$MAIN' && bash '$HELPER' wip/something-T002811 '$TMP/wt-wip' HEAD"
  [ "$status" -ne 0 ]
  [[ "$(suggested_line)" != *"wip/"* ]]
  [[ "$(suggested_line)" != *"chore/something-T002811"* ]]
}
