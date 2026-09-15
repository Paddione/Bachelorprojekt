#!/usr/bin/env bats
# tests/spec/security/cluster-admin-audit.bats
# SSOT: openspec/specs/security.md  (Change: openspec/changes/rbac-exec-least-privilege)
# Ticket: T900110
#
# Pruefmodus: Laufzeit — fuehrt das Audit-Skript aus und prueft Output/Exit-Code
# gegen Fixtures, die kubectl get clusterrolebindings -o json emulieren.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
  FIXTURES="$REPO/tests/spec/security/fixtures"
}

# --- 1.3.1: audit passes on allowlisted bindings ---

@test "1.3.1: audit passes on allowlisted bindings" {
  [ -f "$REPO/scripts/security/cluster-admin-audit.sh" ] \
    || { echo "erwartet: scripts/security/cluster-admin-audit.sh"; false; }

  run bash "$REPO/scripts/security/cluster-admin-audit.sh" --file "$FIXTURES/crb-allowlisted.json"
  echo "status: $status"
  echo "output: $output"
  [ "$status" -eq 0 ]
  # Ausgabe nennt die Zahl geprüfter cluster-admin-Bindings.
  # Positiv-Anker: "7" ist in der Ausgabe (Allowlist mit 7 Bindings).
  [[ "$output" == *"7"* ]] || fail "Erwartet 7 cluster-admin bindings in output: $output"
}

# --- 1.3.2: audit reports an unmanaged cluster-admin ServiceAccount ---

@test "1.3.2: audit reports an unmanaged cluster-admin ServiceAccount" {
  run bash "$REPO/scripts/security/cluster-admin-audit.sh" --file "$FIXTURES/crb-dev-deployer.json"
  echo "status: $status"
  echo "output: $output"
  [ "$status" -eq 1 ]
  # Ausgabe enthaelt dev-deployer und kube-system/dev-deployer.
  [[ "$output" == *"dev-deployer"* ]] || fail "Erwartet 'dev-deployer' in output: $output"
  [[ "$output" == *"kube-system/dev-deployer"* ]] || fail "Erwartet 'kube-system/dev-deployer' in output: $output"
}

# --- 1.3.3: audit rejects missing input ---

@test "1.3.3: audit rejects missing input" {
  run bash "$REPO/scripts/security/cluster-admin-audit.sh" --file "/nonexistent/path/file.json"
  echo "status: $status"
  [ "$status" -eq 2 ]
}

@test "1.3.3b: audit shows help when no arguments given" {
  run bash "$REPO/scripts/security/cluster-admin-audit.sh" 2>&1
  echo "status: $status"
  echo "output: $output"
  [ "$status" -eq 2 ]
  # Muss Usage/help zeigen (enthaelt --file oder --context).
  [[ "$output" == *"--file"* || "$output" == *"--context"* || "$output" == *"Usage"* ]] \
    || fail "Kein Usage/Help gefunden: $output"
}
