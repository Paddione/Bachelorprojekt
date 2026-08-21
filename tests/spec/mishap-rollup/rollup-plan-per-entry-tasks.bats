#!/usr/bin/env bats
# tests/spec/mishap-rollup/rollup-plan-per-entry-tasks.bats — T013043
#
# Pruefmodus: OUTPUT-VERIFIKATION [T002448-M4]. Der Renderer wird AUSGEFUEHRT
# und sein stdout geprueft — kein Source-Grep.
#
# Hintergrund: Der Rollup-Plan trug bis T013043 immer genau drei generische
# Checkboxen (RED/GREEN/Final Verification), unabhaengig von der Zahl der
# Mishap-Eintraege. Ein Executor-Modell hatte damit nichts, woran es Fortschritt
# pro Eintrag festmachen konnte — Zyklus 08-20/T012909 (PR #4884) schloss den
# Container als done/fixed, nachdem 3 von 10 Eintraegen erledigt waren, mit 0
# abgehakten Boxen. Zweite Ursache: die Kommentar-Auswahl filterte nur
# 'NOT LIKE FACTORY-PLAN-REF%', wodurch Watchdog-Meldungen als Batch galten und
# woertlich im Plan landeten.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  RENDER="$REPO_ROOT/scripts/factory/rollup-plan-tasks.sh"
}

# Kommentar-Strom wie ihn mishap-rollup.sh aus tickets.ticket_comments liest:
# ein echter Batch-Kommentar (Format aus mishap.go:253) plus Automatik-Rauschen.
_comments() {
  cat <<'EOF'
### Mishap-Rollup — 2 Eintraege (2026-08-22 09:00 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | suspicious | scripts/branch-reaper.sh | Reaper kennt lebende Worktrees nicht |
| 2 | drift | tests/spec | Fixture-Verzeichnisse bleiben liegen |

**1. Reaper kennt lebende Worktrees nicht** (suspicious, scripts/branch-reaper.sh)

Der Sweep loeschte Remote-Refs von Branches, die in Worktrees ausgecheckt waren.
**2. Fixture-Verzeichnisse bleiben liegen** (drift, tests/spec)

Der BATS-Teardown raeumt angelegte Worktree-Fixtures nicht ab.
Watchdog: pipeline stale > 30min (no phase progress write, class=INFRA). Plan already staged.
Unfactored: die Software Factory hat dieses Ticket nach INFRA-3 erfolglosen Watchdog-Runden abgegeben.
EOF
}

@test "rollup-plan-tasks --count zaehlt Mishap-Eintraege, nicht Kommentare" {
  run bash -c "'$RENDER' --count" <<<"$(_comments)"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | tr -d '[:space:]')" = "2" ]
}

@test "jeder Mishap-Eintrag bekommt eine eigene abhakbare Task" {
  run bash -c "'$RENDER'" <<<"$(_comments)"
  [ "$status" -eq 0 ]
  # Positiv-Anker: beide Eintraege erscheinen als offene Checkbox mit ihrem Titel.
  [ "$(printf '%s\n' "$output" | grep -c '^- \[ \]')" -ge 2 ]
  printf '%s\n' "$output" | grep -e '- \[ \]' | grep -qF 'Reaper kennt lebende Worktrees nicht'
  printf '%s\n' "$output" | grep -e '- \[ \]' | grep -qF 'Fixture-Verzeichnisse bleiben liegen'
}

@test "jede Eintrags-Task verlangt eine Disposition" {
  run bash -c "'$RENDER'" <<<"$(_comments)"
  [ "$status" -eq 0 ]
  # Jede offene Checkbox traegt das Wort Disposition — sonst kann der Executor
  # einen Eintrag abhaken, ohne zu sagen, was mit ihm geschehen ist.
  local boxes dispo
  boxes="$(printf '%s\n' "$output" | grep -c '^- \[ \]')"
  dispo="$(printf '%s\n' "$output" | grep -e '- \[ \]' | grep -ci 'disposition')"
  [ "$boxes" -ge 2 ]
  [ "$dispo" -eq "$boxes" ]
}

@test "Watchdog-Rauschen erzeugt keine Task" {
  run bash -c "'$RENDER'" <<<"$(_comments)"
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst [T002356-M1]: der gueltige Fall wird gerendert ...
  printf '%s\n' "$output" | grep -e '- \[ \]' | grep -qF 'Reaper kennt lebende Worktrees nicht'
  # ... erst dann die Negativ-Aussage.
  run bash -c "'$RENDER'" <<<"$(_comments)"
  [ "$(printf '%s\n' "$output" | grep -e '- \[ \]' | grep -ci 'watchdog')" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -e '- \[ \]' | grep -ci 'unfactored')" -eq 0 ]
}

@test "der gerenderte Block erklaert, wie der Container abzuarbeiten ist" {
  run bash -c "'$RENDER'" <<<"$(_comments)"
  [ "$status" -eq 0 ]
  # Arbeitsanweisung fuer ein Modell ohne Vorwissen: die drei zulaessigen
  # Dispositionen muessen benannt sein, nicht nur das Wort "Disposition".
  printf '%s\n' "$output" | grep -qiF 'gefixt'
  printf '%s\n' "$output" | grep -qiF 'kein Repo-Fix'
  printf '%s\n' "$output" | grep -qiF 'bereits gefixt'
}

@test "leere Eingabe ohne Mishap-Batch meldet 0 und rendert nichts" {
  run bash -c "'$RENDER' --count" <<<"Watchdog: pipeline stale > 30min"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | tr -d '[:space:]')" = "0" ]
}
