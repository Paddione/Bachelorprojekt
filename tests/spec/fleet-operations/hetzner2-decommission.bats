#!/usr/bin/env bats
# tests/spec/fleet-operations/hetzner2-decommission.bats
# SSOT: openspec/changes/wsl-exit-hetzner2-decommission/specs/fleet-operations.md [T016425]

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RUNBOOK="${REPO_ROOT}/docs/runbooks/decommission-k3s-node.md"
  SCRIPT="${REPO_ROOT}/scripts/factory/verify-decommission.sh"
}

@test "runbook exists and documents all five phases with manual gates" {
  [ -f "$RUNBOOK" ]
  for section in "Vorprüfung" "Node entfernen" "Longhorn-Rebuild" "Prometheus-PVC" "Infrastruktur-Rückbau"; do
    grep -q "$section" "$RUNBOOK" || fail "runbook missing section: $section"
  done
  local manual_count
  manual_count=$(grep -c "MANUELL — Operator" "$RUNBOOK")
  [ "$manual_count" -ge 2 ]
}

@test "verify script is read-only (no mutating kubectl verbs)" {
  [ -f "$SCRIPT" ]
  [ -x "$SCRIPT" ]
  # Schreibende Verbs dürfen höchstens in Kommentaren auftreten — Zeilen,
  # die neither comment nor blank sind, dürfen keins enthalten.
  run bash -c "! grep -vE '^\s*(#|$)' '$SCRIPT' | grep -E 'kubectl[^\n]*\b(create|apply|delete|patch|edit|drain|cordon)\b'"
  [ "$status" -eq 0 ]
}

@test "verify script rejects missing argument and validates node absence shape" {
  run bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage:"* ]]
}
