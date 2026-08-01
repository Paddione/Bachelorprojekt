#!/usr/bin/env bats
# Branch-Namens-Guard in scripts/worktree-create.sh [T002470]
#
# scripts/worktree-create.sh legt heute Worktrees fuer Branch-Namen an, die
# .githooks/pre-commit anschliessend bei JEDEM Commit ablehnt. Der Anker-Commit
# (T002412) laeuft mit --no-verify und kaschiert das; erst der erste inhaltliche
# Commit scheitert. Gemessen am 2026-07-29: 4 von 13 aktiven Worktrees betroffen.
#
# RED-Phase: Der Guard existiert noch nicht. Die Ablehnungs-Tests scheitern,
# der Positiv-Anker und die Drift-Guards laufen bereits gruen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  HELPER="$REPO/scripts/worktree-create.sh"
  HOOK="$REPO/.githooks/pre-commit"

  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  # Minimales Repo ohne origin/main: der Divergence-Guard (T001302) feuert dann
  # nicht, und der Namens-Guard laeuft isoliert.
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

# ── RED: konventionswidrige Namen muessen abgelehnt werden ────────────

@test "T002470: kleingeschriebene Ticket-ID wird abgelehnt, kein Worktree entsteht" {
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-lower' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-lower" ]
}

@test "T002470: Kurzform ohne 6-stellige ID wird abgelehnt" {
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/t2450-loc-gates '$TMP/wt-short' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-short" ]
}

@test "T002470: ungueltiges Typ-Praefix feat/ wird abgelehnt" {
  run bash -c "cd '$MAIN' && bash '$HELPER' feat/auto-triage-T002399 '$TMP/wt-feat' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-feat" ]
}

@test "T002470: die Meldung benennt die verletzte Bedingung einzeln" {
  # Positiv-Anker zuerst [T002356-M1]: der konforme Name laeuft durch. Ohne ihn
  # bestuende der folgende Negativtest auch dann, wenn der Helper generell bricht.
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/anker-T002470 '$TMP/wt-anker' HEAD"
  [ "$status" -eq 0 ]

  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-msg' HEAD 2>&1"
  [ "$status" -ne 0 ]
  # Auf die Ticket-ID-Zeile eingrenzen statt gegen den gesamten Output zu matchen:
  # der Worktree-Pfad steht im Output und koennte Suchbegriffe selbst erfuellen.
  echo "$output" | grep -iE 'ticket-id|ticket_id' | grep -q 'T002407'
}

@test "T002470: die Meldung schlaegt den korrigierten Aufruf vor" {
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-sug' HEAD 2>&1"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q 'chore/mishap-T002407'
}

@test "T002470: der Guard greift auch fuer einen bereits existierenden Branch" {
  git -C "$MAIN" branch chore/mishap-t002424
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002424 '$TMP/wt-exists' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-exists" ]
}

# ── Zweitbefund: keine Mutation vor der Validierung ───────────────────

@test "T002470: ein abgelehnter Name loest keinen Stash im Hauptcheckout aus" {
  printf 'uncommitted\n' >> "$MAIN/file.txt"
  before="$(git -C "$MAIN" stash list | wc -l)"
  run bash -c "cd '$MAIN' && bash '$HELPER' chore/mishap-t002407 '$TMP/wt-nostash' HEAD"
  [ "$status" -ne 0 ]
  after="$(git -C "$MAIN" stash list | wc -l)"
  [ "$before" -eq "$after" ]
  # Die ungespeicherte Aenderung liegt unveraendert im Arbeitsbaum.
  grep -q 'uncommitted' "$MAIN/file.txt"
}

# ── Positiv-Anker, Exemptions, Bypass ─────────────────────────────────

@test "T002470: ein konventionskonformer Name legt weiterhin einen Worktree an" {
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/branch-name-guard-T002470 '$TMP/wt-ok' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-ok" ]
}

@test "T002470: renovate/* ist vom Guard ausgenommen" {
  run bash -c "cd '$MAIN' && bash '$HELPER' renovate/npm-lodash '$TMP/wt-ren' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-ren" ]
}

@test "T002470: WT_SKIP_NAME_CHECK=1 laesst einen verletzenden Namen durch" {
  run bash -c "cd '$MAIN' && WT_SKIP_NAME_CHECK=1 bash '$HELPER' chore/mishap-t002407 '$TMP/wt-bypass' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-bypass" ]
}

# ── Drift-Guard: Hook und Helper duerfen nicht auseinanderlaufen ──────
#
# Die Regel steht bewusst an zwei Stellen (siehe Design-Spec): der pre-commit-Hook
# bleibt standalone, damit eine fehlende Lib-Datei nicht jeden Commit blockiert.
# Diese Tests machen den Drift beobachtbar.

@test "T002470: Helper und Hook nutzen dieselbe Ticket-ID-Regex" {
  hook_re="$(grep -oE 'T\[0-9\]\{6,\}' "$HOOK" | head -1)"
  [ -n "$hook_re" ]
  help_re="$(grep -oE 'T\[0-9\]\{6,\}' "$HELPER" | head -1)"
  [ "$help_re" = "$hook_re" ]
}

@test "T002470: Helper und Hook nutzen dieselbe Exemption-Liste" {
  hook_ex="$(grep -oE 'main\|develop\|master\|release-please--\*\|dependabot/\*\|renovate/\*' "$HOOK" | head -1)"
  [ -n "$hook_ex" ]
  help_ex="$(grep -oE 'main\|develop\|master\|release-please--\*\|dependabot/\*\|renovate/\*' "$HELPER" | head -1)"
  [ "$help_ex" = "$hook_ex" ]
}

@test "T002470: Helper und Hook erlauben dieselben Typ-Praefixe" {
  hook_ty="$(grep -oE '\^feature/\|\^fix/\|\^chore/\|\^docs/' "$HOOK" | head -1)"
  [ -n "$hook_ty" ]
  help_ty="$(grep -oE '\^feature/\|\^fix/\|\^chore/\|\^docs/' "$HELPER" | head -1)"
  [ "$help_ty" = "$hook_ty" ]
}
