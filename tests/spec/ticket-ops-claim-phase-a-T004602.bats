#!/usr/bin/env bats
# tests/spec/ticket-ops-claim-phase-a-T004602.bats
#
# [T004602] ticket-ops Step 3.6 verlangte den branch-scoped Claim VOR der
# Worktree-Erstellung; dev-flow-plan Phase A laeuft aber im HAUPT-CHECKOUT
# (propose/design auf main). Mit aktivem Worktree-Claim blockiert der
# worktree-write-guard alle Write-Tools im Haupt-Checkout (korrektes
# Guard-Verhalten, T002357-M1) — die Phase-A-Arbeit braucht den Release.
# Beobachtet 2026-08-14 beim T004295-Lauf.
#
# Fix: ticket-ops Step 3.6 um den Claim-Timing-Hinweis ergaenzen — der Claim
# darf erst NACH der dev-flow-plan-Proposal-Phase (Phase A im Haupt-Checkout)
# gehalten werden bzw. der Dispatch plant die Proposal-Phase vor dem Claim.
#
# Pruefmodus: Guard-Greps auf die Prozedur-Datei (Muster mishap-t002422.bats,
# T002422-M3) — der Defekt ist ein fehlender Hinweis in der Doku, die
# Doku-Existenz ist der Test.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "T004602-M1: procedures.md Step 3.6 nennt den Claim-Timing-Hinweis (erst nach Phase A)" {
  local proc="$REPO_ROOT/.claude/skills/references/ticket-ops-procedures.md"
  [ -f "$proc" ]
  run grep -qiE 'claim.*(erst|nach).*(Phase A|Proposal)|Phase A.*claim' "$proc"
  [ "$status" -eq 0 ]
}

@test "T004602-M2: procedures.md Step 3.6 nennt den Haupt-Checkout-Block durch den Worktree-Claim" {
  local proc="$REPO_ROOT/.claude/skills/references/ticket-ops-procedures.md"
  [ -f "$proc" ]
  run grep -qiE 'Haupt-Checkout|main-checkout' "$proc"
  [ "$status" -eq 0 ]
}

@test "T004602-M3: SKILL.md traegt den Hinweis in der Invarianten-Liste (Claim vs. Phase A)" {
  local skill="$REPO_ROOT/.claude/skills/ticket-ops/SKILL.md"
  [ -f "$skill" ]
  run grep -qiE 'Claim.*Phase A|Phase A.*Claim|Claim.*Haupt-Checkout' "$skill"
  [ "$status" -eq 0 ]
}
