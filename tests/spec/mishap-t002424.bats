#!/usr/bin/env bats
# tests/spec/mishap-t002424.bats — RED/GREEN suite for T002424
# SSOT: openspec/changes/mishap-t002424/tasks.md
#
# Three Mishaps under test:
#   M1: _ticket_lock_guard SID-Mismatch-Diagnose (+ same-tool-Fallback)
#   M2: Pre-Check-Reihenfolge in ticket-ops-procedures.md
#   M3: Scope-Contamination-Guard scripts/pr-scope-check.sh

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ---------------------------------------------------------------------------
# Mishap 1: Diagnose — _ticket_lock_guard logs owner_sid + aktuelle SID
# ---------------------------------------------------------------------------

@test "M1: _ticket_lock_guard enthaelt owner_sid-Extraktion" {
  run grep -n 'owner_sid' "$REPO/scripts/vda/ticket/_ticket-core.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"owner_sid"* ]]
  local file="$REPO/scripts/vda/ticket/_ticket-core.sh"
  run sed -n '/_ticket_lock_guard/,/^}/p' "$file"
  [[ "$output" == *"owner_sid"* ]]
}

@test "M1: _ticket_lock_guard referenziert CLAUDE_CODE_SESSION_ID" {
  run grep -n 'CLAUDE_CODE_SESSION_ID' "$REPO/scripts/vda/ticket/_ticket-core.sh"
  [ "$status" -eq 0 ]
}

@test "M1: _ticket_lock_guard hat same-tool-Fallback (tool detection)" {
  run grep -in -E '(tool|claude|gemini|opencode)' "$REPO/scripts/vda/ticket/_ticket-core.sh"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# Mishap 2: Pre-Check-Reihenfolge in ticket-ops-procedures.md
# ---------------------------------------------------------------------------

@test "M2: Pre-Check-Invariante steht vor Step 3.4 (Step 3.3)" {
  run grep -n '### Step 3\.4' "$REPO/.agents/skills/references/ticket-ops-procedures.md"
  [ "$status" -eq 0 ]
  local step34_line="${lines[0]%%:*}"

  run grep -n 'Pre-Check-Invariante \[T002422\]' "$REPO/.agents/skills/references/ticket-ops-procedures.md"
  [ "$status" -eq 0 ]
  local inv_line="${lines[0]%%:*}"

  [ "$inv_line" -lt "$step34_line" ]
}

@test "M2: LOCK-KONFLIKT existiert im Masterplan-Template Step 3.4" {
  run grep -n 'LOCK-KONFLIKT' "$REPO/.agents/skills/references/ticket-ops-procedures.md"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# Mishap 3: pr-scope-check.sh existiert und funktioniert
# ---------------------------------------------------------------------------

@test "M3: scripts/pr-scope-check.sh existiert und hat --ticket-Flag" {
  [ -f "$REPO/scripts/pr-scope-check.sh" ]
  run bash "$REPO/scripts/pr-scope-check.sh" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"--ticket"* ]]
}

@test "M3: pr-scope-check.sh warnt mit UNSCOPED und hat --allow-drift" {
  run bash "$REPO/scripts/pr-scope-check.sh" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"UNSCOPED"* ]]
  [[ "$output" == *"--allow-drift"* ]]
}

@test "M3: pr-scope-check.sh bei fehlendem --ticket exit 1 (Usage)" {
  run bash "$REPO/scripts/pr-scope-check.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
