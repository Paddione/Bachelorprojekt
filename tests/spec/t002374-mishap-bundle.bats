#!/usr/bin/env bats
# tests/spec/t002374-mishap-bundle.bats — T002374 Mishap-Bundle tests
# Mishap-Bundle: scripts/validate-commit-msg.sh, scripts/agent-lock.sh (2 Einträge)

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  TMP_MSG="$BATS_TEST_TMPDIR/commit-msg"
}

# ── Mishap 1: skills scope ──────────────────────────────────────────────────
# T002328 konsolidierte 'skills' nach 'agents'. Wer Skill-Dateien ändert,
# rät intuitiv 'skills' als Scope. T002374 macht 'skills' wieder zum
# First-Class-Scope.

@test "T002374: 'skills' ist ein gueltiger Commit-Scope (validate-commit-msg)" {
  echo "chore(skills): Skill-Scope aufraeumen" > "$TMP_MSG"
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" message "$TMP_MSG"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}

@test "T002374: 'skills' ist in NAMED_SCOPES von commitlint.config.cjs" {
  run grep -q "'skills'" "$REPO_ROOT/commitlint.config.cjs"
  [ "$status" -eq 0 ]
}

# ── Mishap 2: agent-lock release SID mismatch ───────────────────────────────
# Beim Delegationsmuster (Orchestrator claimt, Subagent released) schlug der
# Release ohne --force fehl: 'lock owned by SID X, current SID Y'.
# Der Fix erlaubt Release auch bei SID-Mismatch, wenn der Aufrufer dieselbe
# CLAUDE_SESSION_ID hat wie der Claim-Eigentümer.

@test "T002374: agent-lock release ohne --force bei SID-Mismatch mit gleicher tool-Klasse" {
  # Setup: lock anlegen mit simulierter SID, aber gleichem tool-Wert
  local lock_dir="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$lock_dir"

  # Lock-Datei manuell anlegen mit abweichender SID, aber tool "unknown"
  # (entspricht dem opencode-Umfeld, wo _detect_tool "unknown" liefert)
  local lf="$lock_dir/ticket__T002374_TEST.json"
  cat > "$lf" <<'EOF'
{
  "scope": "ticket",
  "id": "T002374_TEST",
  "owner_sid": "999999999",
  "owner_pid": "999999",
  "tool": "unknown",
  "label": "test-claim",
  "worktree": "",
  "branch": "chore/test",
  "ticket": "",
  "host": "test",
  "created_at": "1000000000",
  "heartbeat_at": "1000000000"
}
EOF

  # Versuche Release ohne --force — sollte dank gleicher tool-Klasse funktionieren
  AGENT_LOCK_DIR="$lock_dir" \
  AGENT_LOCK_FAKE_ALIVE="999999999" \
  run bash "$REPO_ROOT/scripts/agent-lock.sh" release ticket T002374_TEST
  echo "Exit: $status | Output: $output"
  # Der Release sollte gelingen
  [ "$status" -eq 0 ]
  [ ! -f "$lf" ]
}

@test "T002374: agent-lock release ohne --force schlaegt fehl bei tool-Mismatch" {
  # Sicherstellen, dass ein Release mit unterschiedlichen tool-Klassen NICHT
  # ohne --force gelingt
  local lock_dir="$BATS_TEST_TMPDIR/locks2"
  mkdir -p "$lock_dir"

  local lf="$lock_dir/ticket__T002374_TEST2.json"
  cat > "$lf" <<'EOF'
{
  "scope": "ticket",
  "id": "T002374_TEST2",
  "owner_sid": "999999998",
  "owner_pid": "999998",
  "tool": "claude",
  "label": "test-claim",
  "worktree": "",
  "branch": "chore/test",
  "ticket": "",
  "host": "test",
  "created_at": "1000000000",
  "heartbeat_at": "1000000000"
}
EOF

  AGENT_LOCK_DIR="$lock_dir" \
  AGENT_LOCK_FAKE_ALIVE="999999998" \
  run bash "$REPO_ROOT/scripts/agent-lock.sh" release ticket T002374_TEST2
  echo "Exit: $status | Output: $output"
  # Release sollte fehlschlagen, da tool "claude" != "unknown"
  [ "$status" -eq 1 ]
  [[ "$output" == *"--force"* ]]
}
