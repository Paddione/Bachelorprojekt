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
# T002447 hat den same-tool-Fallback aus T002374 zurueckgenommen: gleiche Tool-
# Klasse berechtigt NICHT mehr, weil alle Sessions dieselbe Klasse melden.

@test "T002374: agent-lock release ohne --fire scheitert bei SID-Mismatch trotz gleicher tool-Klasse" {
  # Setup: lock anlegen mit simulierter SID, tool "claude"
  local lock_dir="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$lock_dir"

  local lf="$lock_dir/ticket__T002374_TEST.json"
  cat > "$lf" <<'EOF'
{
  "scope": "ticket",
  "id": "T002374_TEST",
  "owner_sid": "999999999",
  "owner_pid": "999999",
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

  # Versuche Release ohne --force mit gleicher tool-Klasse, aber anderer SID
  AGENT_LOCK_DIR="$lock_dir" \
  AGENT_LOCK_FAKE_ALIVE="999999999" \
  AGENT_LOCK_TOOL=claude AGENT_LOCK_SID="888888888" \
  run bash "$REPO_ROOT/scripts/agent-lock.sh" release ticket T002374_TEST
  echo "Exit: $status | Output: $output"
  # Release muss scheitern — gleiche Tool-Klasse reicht nicht mehr [T002447]
  [ "$status" -eq 1 ]
  [[ "$output" == *"--force"* ]]
  [ -f "$lf" ]
}

@test "T002374: agent-lock release ohne --force scheitert bei tool-Mismatch" {
  # Sicherstellen, dass ein Release mit unterschiedlichen tool-Klassen NICHT
  # ohne --force gelingt (Fixture tool=claude, Aufrufer tool=gemini via AGENT_LOCK_TOOL)
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
  AGENT_LOCK_TOOL=gemini AGENT_LOCK_SID="777777777" \
  run bash "$REPO_ROOT/scripts/agent-lock.sh" release ticket T002374_TEST2
  echo "Exit: $status | Output: $output"
  # Release sollte fehlschlagen, da SID mismatch + tool class nicht hilft
  [ "$status" -eq 1 ]
  [[ "$output" == *"--force"* ]]
}
