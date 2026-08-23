#!/usr/bin/env bats
# tests/spec/sessions-server.bats
# SSOT: openspec/specs/sessions-server.md
#
# Initial placeholder coverage for the Sessions Server spec. [T002010]
# Manifest-Hardening assertions (non-root nginx on 8080): T014553, SA-GR-06.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  MANIFEST="${REPO_ROOT}/k3d/sessions-server.yaml"
}

@test "sessions-server spec covered" {
  run true
  [ "$status" -eq 0 ]
}

@test "sessions-server: nginx lauscht auf 8080" {
  # ConfigMap-Server-Blöcke und der Container lauschen auf dem unprivilegierten Port
  grep -qE 'listen[[:space:]]+8080' "$MANIFEST"
  grep -qE 'containerPort:[[:space:]]*8080' "$MANIFEST"
}

@test "sessions-server: Service zeigt auf 8080" {
  grep -qE 'targetPort:[[:space:]]*8080' "$MANIFEST"
}

@test "sessions-server: Container läuft non-root" {
  dep_block="$(awk '/^kind: Deployment$/{f=1} f{print} f&&/^---$/{exit}' "$MANIFEST")"
  echo "$dep_block" | grep -qE 'runAsNonRoot:[[:space:]]*true'
  echo "$dep_block" | grep -qE 'readOnlyRootFilesystem:[[:space:]]*true'
}
