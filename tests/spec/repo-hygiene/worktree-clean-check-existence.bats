#!/usr/bin/env bats
# tests/spec/repo-hygiene/worktree-clean-check-existence.bats
# SSOT: openspec/specs/agent-skills.md — repo-hygiene-Runbook §1
#
# Ticket T002932. Der Sauberkeits-Vorcheck vor `git worktree remove` lief als Pipe:
#   git -C <pfad> status --porcelain | cut -c4- | grep -Ev ...
# Fehlt das Verzeichnis physisch (Registrierung noch in .git/worktrees, Verzeichnis weg),
# schreibt git `fatal: cannot change to '<pfad>'` nach stderr und endet mit 128 — die Pipe
# verwirft den Exit-Code und liefert eine leere Ausgabe. Leer heisst in dieser Form
# "sauber", also Freigabe zum Entfernen. Verifiziert am 2026-08-10:
#   git -C /nicht/vorhanden status --porcelain 2>/dev/null | wc -l   -> 0
#   git -C /home/patrick/Bachelorprojekt status --porcelain | wc -l  -> 0
# Beide Male 0 — der Fehlerfall ist vom Gesundfall nicht unterscheidbar.
#
# Dieselbe Fehlerklasse wie T003109 (all() ueber die leere Liste) und T003278 (bats mit
# Exit 0 auf fehlender Datei): eine Pruefung besteht still, weil ihr die Substanz fehlt.
# Dieser Guard loest nur den Worktree-Fall.
#
# Pruefmodus: **Kommando-Ergebnis-Verifikation** (Bloecke 1-4) plus eine Quelltext-Aussage
# (Block 5) — Letztere ist die ausdrueckliche Ausnahme der Konvention T002448-M4 fuer
# Doku-Regeln ohne ausfuehrbares Laufzeitverhalten. Ein Guard wirkt nur, wenn er
# aufgerufen wird; Block 5 sichert genau diesen Aufruf im Runbook.
#
# Bewusst NICHT geprueft wird der Wortlaut der Meldungen oder das Ausgabeformat von
# `git status` (T002716) — geprueft werden Exit-Codes und die Nennung des Pfades.
#
# Jeder Block belegt ZUERST, dass sein Bezugspunkt existiert (Positiv-Anker, T002356-M1),
# und prueft DANN die eigentliche Aussage.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CHECK="${REPO_ROOT}/scripts/worktree-clean-check.sh"
  OPS="${REPO_ROOT}/.claude/skills/references/repo-hygiene-ops.md"
}

# Wegwerf-Repo ohne Bezug zum Repo des Laufs.
_make_repo() {
  local wt="$1"
  mkdir -p "$wt/website/src/data" "$wt/scripts"
  git -C "$wt" init -q
  git -C "$wt" symbolic-ref HEAD refs/heads/main
  git -C "$wt" config user.email "t002932@example.invalid"
  git -C "$wt" config user.name "T002932 Guard"
  printf '{}\n' > "$wt/website/src/data/openspec-status.json"
  printf 'echo base\n' > "$wt/scripts/beispiel.sh"
  git -C "$wt" add -A
  git -C "$wt" commit -qm "base"
}

@test "T002932: ein existierender sauberer Worktree wird weiterhin als sauber gemeldet" {
  # Positiv-Anker fuer die gesamte Datei: ohne ihn koennte ein Skript, das IMMER
  # abbricht, alle Negativ-Aussagen unten erfuellen.
  [ -x "$CHECK" ]

  local wt="${BATS_TEST_TMPDIR}/sauber"
  _make_repo "$wt"

  run "$CHECK" "$wt"
  [ "$status" -eq 0 ]
}

@test "T002932: ein fehlendes Worktree-Verzeichnis gilt NICHT als sauber" {
  [ -x "$CHECK" ]

  local missing="${BATS_TEST_TMPDIR}/gibt-es-nicht"
  # Positiv-Anker: der Pfad existiert wirklich nicht — sonst pruefte der Block
  # versehentlich den Gesundfall.
  [ ! -e "$missing" ]

  run "$CHECK" "$missing"
  # Semantik statt Darstellung: der Befund haengt am Exit-Code, nicht am Wortlaut.
  [ "$status" -ne 0 ]
  # Der Bediener muss erkennen, WELCHER Pfad betroffen ist.
  printf '%s\n' "$output" | grep -qF "$missing"
}

@test "T002932: ein Pfad ohne Git-Repository gilt NICHT als sauber" {
  [ -x "$CHECK" ]

  # Verzeichnis existiert, aber `git status` scheitert — der zweite Weg, auf dem die
  # Pipe-Form einen Fehler in ein Sauber-Urteil verwandelt.
  local nogit="${BATS_TEST_TMPDIR}/kein-repo"
  mkdir -p "$nogit"
  # Positiv-Anker: das Verzeichnis existiert, die Existenzpruefung allein greift hier
  # also nicht — geprueft wird wirklich der Exit-Code von git.
  [ -d "$nogit" ]

  run "$CHECK" "$nogit"
  [ "$status" -ne 0 ]
}

@test "T002932: die Generat-Allowlist aus §1 bleibt wirksam" {
  [ -x "$CHECK" ]

  local wt="${BATS_TEST_TMPDIR}/generat"
  _make_repo "$wt"
  printf '{"regeneriert": true}\n' > "$wt/website/src/data/openspec-status.json"

  # Positiv-Anker: fuer git ist der Worktree dirty. Ohne ihn waere die Aussage
  # "gilt trotzdem als sauber" auch bei unveraendertem Baum wahr.
  run bash -c "git -C '$wt' status --porcelain"
  [ -n "$output" ]

  # Folgenloses Generat -> weiterhin sauber (Parität zu T003121).
  run "$CHECK" "$wt"
  [ "$status" -eq 0 ]

  # Echte ungesicherte Arbeit -> Befund, und zwar mit einem anderen Exit-Code als der
  # Fehlerfall oben, damit "dirty" und "nicht pruefbar" unterscheidbar bleiben.
  printf 'echo ungesicherte Arbeit\n' >> "$wt/scripts/beispiel.sh"
  run "$CHECK" "$wt"
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -qF 'scripts/beispiel.sh'
}

@test "T002932: Runbook §1 ruft den Vorcheck als Skript auf" {
  # Ein Guard wirkt nur, wenn er ausgefuehrt wird — die Aufrufstelle ist Teil des Fixes.
  [ -f "$OPS" ]

  local sec
  sec="$(awk '
    /^## 1[.]/ { inside = 1; next }
    inside && /^## / { inside = 0 }
    inside { print }
  ' "$OPS")"

  # Positiv-Anker: §1 existiert und handelt vom Remove.
  [ -n "$sec" ]
  printf '%s\n' "$sec" | grep -qF 'git worktree remove'

  # Die Aussage: der operative Vorcheck ist der Skriptaufruf.
  printf '%s\n' "$sec" | grep -qF 'scripts/worktree-clean-check.sh'
}
