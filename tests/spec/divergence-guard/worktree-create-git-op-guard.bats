#!/usr/bin/env bats
# Guard gegen unterbrochene git-Operationen im Anlege-/Wiederverwendungspfad
# von scripts/worktree-create.sh [T003215]
#
# PRUEFMODUS: Output-Verifikation (CLAUDE.md T002448-M4). Jeder Test fuehrt
# scripts/worktree-create.sh gegen ein Wegwerf-Repo aus (`git init` in mktemp)
# und misst Exit-Code und Dateisystem-Zustand — kein Source-Grep auf das Skript.
# Semantik statt Darstellung (T002716): geprueft werden Exit-Code, Fortbestand
# des Rebase-Zustandsverzeichnisses und ein ankerfreier Substring-Treffer auf
# den Zielpfad, nicht der Wortlaut einer Meldung.
#
# BEFUND (T003215): scripts/worktree-create.sh entfernt einen bereits am
# Zielpfad liegenden Worktree per `git worktree remove --force`, ohne vorher zu
# pruefen, ob dort eine git-Operation offen steht. Ein Worktree mitten in einem
# abgebrochenen Rebase — Konflikte bereits aufgeloest und gestaged, nur
# `git rebase --continue` fehlt — wird damit stillschweigend vernichtet.
# Gemessen am 2026-08-10 gegen 8d77df268 mit genau dem Fixture unten:
# Exit 0, und das Verzeichnis `rebase-merge` war nach dem Lauf verschwunden.
#
# Der Sauberkeits-Vorcheck aus repo-hygiene-ops.md kann diesen Zustand
# strukturell nicht sehen (Begruendung und Reproduktion: T002766,
# tests/spec/agent-skills/worktree-mid-rebase-guard.bats). Deshalb muss der
# Guard im Anlegepfad selbst sitzen.
#
# ENTSCHEIDUNG fail-closed (T003215): Am ZIELPFAD bricht worktree-create ab
# (Exit 5), weil der Aufrufer dort gerade mit Arbeit BEGINNEN will und die
# Alternative unwiederbringlicher Verlust der Konfliktaufloesung ist. Fremde
# Worktrees bleiben unberuehrt und blockieren nichts — sonst legte ein
# einzelner haengender Rebase die gesamte Factory still.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  HELPER="$REPO/scripts/worktree-create.sh"
  [ -x "$HELPER" ] || [ -f "$HELPER" ]

  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  # Wegwerf-Repo OHNE origin: der Divergence-Guard (T001302) und der
  # main-Branch-Zwang (T002448-M1) feuern dann nicht, der zu pruefende Guard
  # laeuft isoliert. Niemals gegen echte Worktrees des Hauptrepos testen.
  MAIN="$TMP/main"
  mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.invalid
  git -C "$MAIN" config user.name  Tester
  printf 'base\n' > "$MAIN/file.txt"
  git -C "$MAIN" add -A
  git -C "$MAIN" commit -qm init
}

teardown() { rm -rf "$TMP"; }

# Legt via worktree-create.sh einen Worktree an und faehrt ihn in einen
# abgebrochenen Rebase: Konflikt aufgeloest und gestaged, --continue nie
# ausgefuehrt. Setzt $STATE auf das Rebase-Zustandsverzeichnis.
_make_mid_rebase_worktree() {
  local branch="$1" path="$2"
  ( cd "$MAIN" && bash "$HELPER" "$branch" "$path" HEAD ) >/dev/null 2>&1
  printf 'featside\n' > "$path/file.txt"
  git -C "$path" commit -qam feat
  printf 'mainside\n' > "$MAIN/file.txt"
  git -C "$MAIN" commit -qam mainside
  # Plain, nicht-interaktiver Rebase; das Merge-Backend ist der Standard.
  git -C "$path" rebase main >/dev/null 2>&1 || true
  printf 'resolved\n' > "$path/file.txt"
  git -C "$path" add file.txt
  # Vor dem Lauf aufloesen: nach einem `worktree remove` beantwortet
  # `rev-parse --git-path` die Frage nicht mehr.
  STATE="$(git -C "$path" rev-parse --git-path rebase-merge)"
}

@test "T003215 Positiv-Anker: ein sauberer Worktree am Zielpfad wird weiterhin anstandslos wiederverwendet" {
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/anker-T003215 '$TMP/wt-clean' HEAD"
  [ "$status" -eq 0 ]
  # Zweiter Lauf auf denselben Pfad: genau der Wiederverwendungspfad, in dem der
  # Guard sitzen wird. Ein Guard, der hier zuschlaegt, waere zu breit.
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/anker-T003215 '$TMP/wt-clean' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-clean" ]
}

@test "T003215: ein Worktree mitten im Rebase am Zielpfad bricht die Anlage ab statt still weiterzulaufen" {
  _make_mid_rebase_worktree fix/midrebase-T003215 "$TMP/wt-mid"
  # Positiv-Anker (T002356-M1): der Zustand, gegen den geprueft wird, ist real
  # vorhanden. Ohne ihn bestuende die Aussage auch bei kaputtem Fixture.
  [ -d "$STATE" ]

  run bash -c "cd '$MAIN' && bash '$HELPER' fix/midrebase-T003215 '$TMP/wt-mid' HEAD"
  [ "$status" -ne 0 ]
  # Der Zielpfad wird benannt — Substring, kein Zeilenanker, kein Wortlaut.
  echo "$output" | grep -qF "$TMP/wt-mid"
}

@test "T003215: der abgebrochene Rebase ueberlebt den Lauf — nichts wird force-entfernt" {
  _make_mid_rebase_worktree fix/survive-T003215 "$TMP/wt-survive"
  [ -d "$STATE" ]

  run bash -c "cd '$MAIN' && bash '$HELPER' fix/survive-T003215 '$TMP/wt-survive' HEAD"
  # Positiv-Anker: der Helper wurde ueberhaupt ausgefuehrt (127 = nicht gefunden);
  # ein nie gestartetes Skript zerstoert trivial nichts.
  [ "$status" -ne 127 ]
  [ -d "$STATE" ]
  # Die aufgeloeste, noch nicht committete Konfliktloesung ist ebenfalls noch da.
  [ "$(cat "$TMP/wt-survive/file.txt")" = "resolved" ]
}

@test "T003215: der Abbruch traegt einen eigenen Exit-Code (5), unterscheidbar von 1/3/4" {
  _make_mid_rebase_worktree fix/exitcode-T003215 "$TMP/wt-exit"
  [ -d "$STATE" ]

  run bash -c "cd '$MAIN' && bash '$HELPER' fix/exitcode-T003215 '$TMP/wt-exit' HEAD"
  # Aufrufer wie scripts/vda/factory-prep.sh verwerfen stdout und stderr
  # (`>/dev/null 2>&1`) und sehen ausschliesslich den Exit-Code — eine reine
  # Warnung waere dort nachweislich unsichtbar. Der Code muss sich von den
  # bestehenden Bedeutungen unterscheiden: 1 = generisch, 3 = branch in use,
  # 4 = Zielpfad mit live Agent-Lock.
  [ "$status" -eq 5 ]
}

@test "T003215 Positiv-Anker: ein FREMDER Worktree im Rebase blockiert eine Anlage an anderem Pfad nicht" {
  _make_mid_rebase_worktree fix/fremd-T003215 "$TMP/wt-fremd"
  # Positiv-Anker: der fremde Rebase-Zustand existiert wirklich.
  [ -d "$STATE" ]

  # Der Guard muss auf den Zielpfad begrenzt sein. Repo-weit angewendet legte
  # ein einzelner haengender Fremd-Worktree jede weitere Anlage still — und
  # damit die Factory, die worktree-create.sh pro Ticket aufruft.
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/neu-T003215 '$TMP/wt-neu' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-neu" ]
}
