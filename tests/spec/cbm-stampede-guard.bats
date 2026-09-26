#!/usr/bin/env bats
# tests/spec/cbm-stampede-guard.bats
# SSOT: openspec/changes/k3-auto-refresh/design.md (E2/E4/E6), p1-Schnittstellenvertrag
# Ticket: T900450

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WRAPPER="$REPO_ROOT/scripts/mcp/cbm-single-flight.sh"
  CRON="$REPO_ROOT/scripts/cbm-refresh-cron.sh"
  RUNBOOK="$REPO_ROOT/docs/runbooks/cbm-index-stampede.md"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
}

@test "T900450-W1: Wrapper existiert, ist ausfuehrbar, enthaelt flock + Lockpfad + Timeout 3000 + Exit-3-Zweig" {
  [ -f "$WRAPPER" ] || { echo "MISSING wrapper: $WRAPPER"; return 1; }
  [ -x "$WRAPPER" ] || { echo "NOT-EXECUTABLE: $WRAPPER"; return 1; }
  grep -q 'flock' "$WRAPPER"
  grep -qF '.cache/codebase-memory-mcp/cbm-index.lock' "$WRAPPER"
  grep -q '3000' "$WRAPPER"
  grep -q 'exit 3' "$WRAPPER"
}

@test "T900450-W2: Wrapper ohne Argumente beendet sich mit Exit 2 (kein MCP-Aufruf erreicht)" {
  command -v codebase-memory-mcp >/dev/null || skip 'codebase-memory-mcp fehlt auf CI (T002820)'
  run bash "$WRAPPER"
  [ "$status" -eq 2 ]
}

@test "T900450-C1: Cron-Skript referenziert den Wrapper, traegt fresh-skip-Zweig und dokumentierten Cron-Eintrag" {
  [ -f "$CRON" ] || { echo "MISSING cron: $CRON"; return 1; }
  grep -q 'cbm-single-flight.sh' "$CRON"
  grep -q 'fresh-skip' "$CRON"
  grep -qE '0 (\*/4)? \* \* \*' "$CRON"
}

@test "T900450-C2: Cron --dry-run stdout ist genau eine JSON-Zeile mit .status" {
  command -v codebase-memory-mcp >/dev/null || skip 'codebase-memory-mcp fehlt auf CI (T002820)'
  run bash "$CRON" --dry-run
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | wc -l)" -le 1 ]
  printf '%s' "$output" | jq -e .status >/dev/null
}

@test "T900450-A1: Kein direktes index_repository in Automation (nur Wrapper-Passthrough)" {
  [ "$(grep -c 'index_repository' "$WRAPPER")" -eq 1 ]
  ! grep -v '^#' "$CRON" | grep -q 'index_repository'
  ! grep -q 'codebase-memory-mcp cli index_repository' "$TASKFILE"
  [ "$(grep -c 'cbm-single-flight' "$TASKFILE")" -eq 2 ]
}

@test "T900450-R1: Runbook enthaelt index_status + detect_changes + Wrapper + Task-Referenz" {
  [ -f "$RUNBOOK" ] || { echo "MISSING runbook: $RUNBOOK"; return 1; }
  [ "$(grep -c 'index_status' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'detect_changes' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'cbm-single-flight.sh' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'codebase:index' "$RUNBOOK")" -ge 1 ]
}
