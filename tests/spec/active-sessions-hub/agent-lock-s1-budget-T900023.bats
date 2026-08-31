#!/usr/bin/env bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T900023 — `scripts/agent-lock.sh` hat mit dem Windows-Pfad-Fix (d60c3704)
# das S1-Limit gerissen: 806 Zeilen bei Limit 800 fuer `.sh`.
#
# Das Repo-Gate meldet es bereits:
#   node scripts/code-quality/check.mjs
#   ✗ NEW: S1:scripts/agent-lock.sh — 806 lines > 800 limit (.sh)
#
# Dieser Guard haelt den Befund an der Datei fest, statt ihn dem Baseline-Ratchet zu
# ueberlassen: `quality:check` verstummt, sobald der Wert einmal gebaselined wird —
# die Datei waere dann dauerhaft ueber dem Limit, ohne dass es noch jemand meldet.
#
# Pruefmodus: command output verification (T002448-M4) — der Rueckgabewert von
# plan-lint.sh residual_budget, kein Quelltext-grep und keine feste Zeilenzahl.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "scripts/agent-lock.sh stays within its S1 line budget" {
  run bash "$REPO_ROOT/scripts/plan-lint.sh" residual_budget scripts/agent-lock.sh
  [ "$status" -eq 0 ]
  # Negatives Restbudget = Limit gerissen. Die Zahl selbst ist nicht Gegenstand des
  # Tests, nur ihr Vorzeichen — sonst muesste der Test bei jeder Zeile nachgezogen werden.
  [ "$output" -ge 0 ]
}
