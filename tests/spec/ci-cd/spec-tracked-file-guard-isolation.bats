#!/usr/bin/env bats
# tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats
# SSOT: openspec/specs/mcp-gateway.md (Requirement: Tracked-File Mutation
# Guard Is Immune To Concurrent Legitimate Spec Runs)
# Ticket: T003001 (Symptom aus PR #3974, CI-Run 31315262369, Shard 4/4;
# T003006 ist eine bereits geschlossene Dublette dieses Tickets)
#
# Pruefmodus (T002448-M4): ERGEBNIS-orientiert. Simuliert die Race
# deterministisch statt sie ueber `bats -j` abzuwarten: ein kontrollierter
# Hintergrundprozess beruehrt waehrend des Messfensters wiederholt eine der
# vier real getrackten Dateien, die spec-tracked-file-guard.bats::_stamp()
# global liest. Vorher (Bug): der T002779-Guard-Test liest globale
# Repo-mtimes und wird durch JEDE gleichzeitig laufende Beruehrung verfaelscht
# — unabhaengig davon, ob mcp-tooling.bats selbst etwas falsch macht. Nachher
# (Fix): der Guard misst gegen eine Sandbox-Kopie des Repos und ist gegen
# solche Fremdberuehrungen der echten Arbeitskopie immun.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  BATS_BIN="$REPO_ROOT/tests/unit/lib/bats-core/bin/bats"
  GUARD_BATS="$REPO_ROOT/tests/spec/ci-cd/spec-tracked-file-guard.bats"
  DECOY_FILE="$REPO_ROOT/docs/agent-guide/registry/mcp.yaml"
}

@test "T003001: guard's T002779 assertion stays green under concurrent real-file touches" {
  [ -f "$DECOY_FILE" ]

  # Kontrollierter Decoy: beruehrt waehrend des gesamten Testlaufs wiederholt
  # eine der vier Dateien, die _stamp() im Guard global liest — simuliert eine
  # andere, legitime Spec-Datei, die unter `bats -j` parallel dieselbe Datei
  # anfasst (bisher: authenticated-http-headers.bats).
  (
    for _ in $(seq 1 60); do
      touch "$DECOY_FILE" 2>/dev/null
      sleep 0.05
    done
  ) &
  local decoy_pid=$!

  run "$BATS_BIN" --filter "T002779: mcp-tooling.bats laesst die getrackte MCP-Registry unberuehrt" "$GUARD_BATS"
  local guard_status="$status"
  local guard_output="$output"

  kill "$decoy_pid" 2>/dev/null || true
  wait "$decoy_pid" 2>/dev/null || true

  echo "$guard_output"
  [ "$guard_status" -eq 0 ]
}
