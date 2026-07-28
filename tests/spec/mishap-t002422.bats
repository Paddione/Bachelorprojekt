#!/usr/bin/env bats
# tests/spec/mishap-t002422.bats
# T002422 — Mishap-Bundle: psql column alignment, agent-lock SID mismatch, pre-check ordering

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Mishap 1: psql-Pipe-Ausgabe bricht bei langen Titeln ────────────────────

@test "T002422-M1: enriched query uses json_agg + json_build_object (JSON instead of pipe columns)" {
  local proc="$REPO/.claude/skills/references/ticket-ops-procedures.md"
  [ -f "$proc" ]
  # Verify the SQL block uses JSON aggregation — this is the fix
  run grep -q 'json_agg(json_build_object' "$proc"
  [ "$status" -eq 0 ]
  # The T002422 change note confirms the switch was documented
  run grep -q 'JSON-Ausgabe statt Pipe-Spalten \[T002422\]' "$proc"
  [ "$status" -eq 0 ]
}

# ── Mishap 2: agent-lock SID mismatch zwischen claim und update-status ──────

@test "T002422-M2: _ticket_lock_guard passes CLAUDE_CODE_SESSION_ID to sub-bash" {
  local core="$REPO/scripts/vda/ticket/_ticket-core.sh"
  [ -f "$core" ]
  run grep -q 'CLAUDE_CODE_SESSION_ID="${CLAUDE_CODE_SESSION_ID:-}"' "$core"
  [ "$status" -eq 0 ]
}

@test "T002422-M2: _ticket_lock_guard passes CLAUDE_SESSION_ID to sub-bash" {
  local core="$REPO/scripts/vda/ticket/_ticket-core.sh"
  [ -f "$core" ]
  run grep -q 'CLAUDE_SESSION_ID="${CLAUDE_SESSION_ID:-}"' "$core"
  [ "$status" -eq 0 ]
}

@test "T002422-M2: T002422 comment present in _ticket_lock_guard" {
  local core="$REPO/scripts/vda/ticket/_ticket-core.sh"
  [ -f "$core" ]
  run grep -q 'T002422' "$core"
  [ "$status" -eq 0 ]
}

# ── Mishap 3: Lock-Prüfung im Dispatch kommt zu spät ────────────────────────

@test "T002422-M3: SKILL.md Phase 3 contains Pre-Check-Invariante" {
  local skill="$REPO/.claude/skills/ticket-ops/SKILL.md"
  [ -f "$skill" ]
  run grep -q 'Pre-Check-Invariante \[T002422\]' "$skill"
  [ "$status" -eq 0 ]
}

@test "T002422-M3: procedures.md Step 3.5 contains pre-check step" {
  local proc="$REPO/.claude/skills/references/ticket-ops-procedures.md"
  [ -f "$proc" ]
  run grep -q 'Pre-Check-Invariante \[T002422\]' "$proc"
  [ "$status" -eq 0 ]
}

@test "T002422-M3: procedures.md Step 3.5 has pre-check step 0 before claim" {
  local proc="$REPO/.claude/skills/references/ticket-ops-procedures.md"
  [ -f "$proc" ]
  # The pre-check step 0 should mention agent-lock.sh check ticket
  run grep -q '\*\*Pre-Check:\*\*.*agent-lock.sh check ticket' "$proc"
  [ "$status" -eq 0 ]
}
