#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T002783 — Mishap-Rollup-Pipeline: Container-Aufloesung und Worktree-Anlage
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Beide Tests FUEHREN das jeweilige
# Skript AUS und pruefen dessen stdout/stderr und Exit-Code — es wird NICHT der Quelltext
# gegreppt. Jeder Test traegt einen Positiv-Anker (T002356-M1), der das Werkzeug selbst
# nachweist, bevor die eigentliche Aussage geprueft wird; ohne ihn bestuende der Test
# vakuos, sobald das Skript gar nicht mehr laeuft.
#
# HINTERGRUND (alle drei Blocker am 2026-08-09 durch Ausfuehren reproduziert):
#   1. Flush und Rollup loesen den Container unterschiedlich auf — der Flush akzeptiert
#      geschlossene Container, der Rollup verlangt plan_staged. Ergebnis: der Flush schrieb
#      in done-Container, der Rollup fand nichts und meldete exit 0.
#   2. mishap-rollup.sh nutzt den festen, ticketlosen Branch chore/mishap-incident-rollup;
#      worktree-create.sh lehnt ihn wegen fehlender Ticket-ID ab.
#   3. worktree-create.sh verlangt, dass der Haupt-Checkout auf main steht — in einem vom
#      Factory-Tick unbeaufsichtigt aufgerufenen Pfad nicht kontrollierbar.
#
# Entwurfsentscheidung (Brainstorming T002783): eine GEMEINSAME Container-Aufloesung fuer
# beide Seiten, exponiert als ticket.sh-Subkommando, plus ein --unattended-Modus in
# worktree-create.sh.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T002783: ticket.sh bietet ein rollup-container-Kommando als gemeinsame Container-Aufloesung" {
  # Positiv-Anker: ticket.sh laeuft ueberhaupt und gibt seine Kommandoliste aus.
  run bash "$REPO_ROOT/scripts/ticket.sh"
  [ -n "$output" ]
  commands_line="$(printf '%s\n' "$output" | grep '^Commands:')"
  [ -n "$commands_line" ]
  # Anker-Gegenprobe: ein bekanntes Bestandskommando steht in genau dieser Zeile.
  [ "$(printf '%s' "$commands_line" | grep -c 'stage-plan')" -eq 1 ]

  # Eigentliche Aussage: die gemeinsame Aufloesung ist als Kommando verfuegbar.
  # Bewusst auf die Commands-Zeile eingegrenzt (CLAUDE.md: $0-Falle bei Volltext-Matching
  # gegen stdout — der Worktree-Pfad enthaelt den Slug und koennte sonst selbst matchen).
  [ "$(printf '%s' "$commands_line" | grep -c 'rollup-container')" -eq 1 ]
}

@test "T002783: worktree-create.sh --help laeuft unabhaengig vom Branch und nennt --unattended" {
  run bash "$REPO_ROOT/scripts/worktree-create.sh" --help

  # Positiv-Anker: --help beantwortet die Frage ueberhaupt, statt am main-Guard zu sterben.
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [ "$(printf '%s\n' "$output" | grep -c 'FATAL')" -eq 0 ]

  # Eigentliche Aussage: der unbeaufsichtigte Modus ist dokumentiert und damit vorhanden.
  [ "$(printf '%s\n' "$output" | grep -c -- '--unattended')" -ge 1 ]
}

# ── [T002914] Rollup-Rebase gegen origin/<BRANCH>, nicht origin/main ─────────
# Ein divergierter Rollup-Branch (Remote hat eigene Commits, die die lokale
# Chain nicht kennt) bleibt bei einem Rebase auf origin/main dauerhaft
# non-fast-forward — jeder Push wird abgelehnt. Das Skript muss deshalb gegen
# origin/${BRANCH} rebasen (nach fetch), damit die Remote-Chain integriert wird.

@test "T002914: mishap-rollup.sh rebased gegen origin/<BRANCH> statt origin/main" {
  run grep -n "rollup_rebase_onto_remote\|origin/\${BRANCH}" "$REPO_ROOT/scripts/factory/mishap-rollup.sh"
  [ "$status" -eq 0 ] || { echo "MISSING rebase-onto-origin-branch in mishap-rollup.sh"; false; }

  # Negativ-Anker: der alte, toedliche Pfad darf nicht mehr aktiv sein.
  run grep -n "git rebase origin/main" "$REPO_ROOT/scripts/factory/mishap-rollup.sh"
  [ "$status" -eq 1 ] || { echo "STILL rebasing onto origin/main in mishap-rollup.sh"; false; }
}
