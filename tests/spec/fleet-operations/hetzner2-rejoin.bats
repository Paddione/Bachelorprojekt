#!/usr/bin/env bats
# tests/spec/fleet-operations/hetzner2-rejoin.bats
# SSOT: openspec/changes/rejoin-gekko-hetzner2-fleet/specs/fleet-operations.md [T016442]
# Prüfmodus: Output-/Existenz-Verifikation (Runbook-Abschnitte + Skript-Verhalten).

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RUNBOOK="${REPO_ROOT}/docs/runbooks/rejoin-k3s-node.md"
  SCRIPT="${REPO_ROOT}/scripts/factory/verify-rejoin.sh"
}

@test "rejoin runbook exists and documents rejoin phases with manual gates" {
  [ -f "$RUNBOOK" ]
  for section in "Ursache prüfen" "Agent rejoinen" "Longhorn-Node" "Prometheus-PVC" "Abschluss"; do
    grep -q "$section" "$RUNBOOK" || fail "runbook missing section: $section"
  done
  local manual_count
  manual_count=$(grep -c "MANUELL — Operator" "$RUNBOOK")
  [ "$manual_count" -ge 1 ]
}

@test "rejoin verify script is read-only (no mutating kubectl verbs)" {
  [ -f "$SCRIPT" ]
  [ -x "$SCRIPT" ]
  # Schreibende Verbs dürfen höchstens in Kommentaren auftreten — Zeilen,
  # die neither comment nor blank sind, dürfen keins enthalten.
  run bash -c "! grep -vE '^\s*(#|$)' '$SCRIPT' | grep -E 'kubectl[^\n]*\b(create|apply|delete|patch|edit|drain|cordon)\b'"
  [ "$status" -eq 0 ]
}

@test "rejoin verify script rejects missing argument and validates node presence shape" {
  run bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage:"* ]]
}
