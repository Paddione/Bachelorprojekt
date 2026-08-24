#!/usr/bin/env bats
# tests/spec/fleet-operations/sdlc-console-fleet.bats
# SSOT: openspec/changes/wsl-exit-sdlc-console-fleet/specs/sdlc-isolation.md [T016429]

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "no manual bridge-ip endpoints hack remains in the repo manifests" {
  run grep -rln "llm-proxy-host" "${REPO_ROOT}/k3d"
  if [ "$status" -eq 0 ]; then
    echo "hack still referenced in:"; echo "$output"; return 1
  fi
  [ ! -f "${REPO_ROOT}/k3d/sdlc-stack/llm-proxy-host.yaml" ]
}

@test "fleet console starts with LLM disabled (fail-closed) and independent readiness" {
  local f="${REPO_ROOT}/k3d/dev-stack/sdlc-console.yaml"
  [ -f "$f" ]
  grep -q 'LLM_ENABLED: "false"' "$f"
  # Readiness hängt nicht am LLM-Endpoint:
  grep -q "path: /api/health" "$f"
  ! grep -q "llm-proxy-host" "$f"
}

@test "fleet console uses dev-stack db and placeholder secrets pattern" {
  local f="${REPO_ROOT}/k3d/dev-stack/sdlc-console.yaml"
  grep -q "shared-db-dev:5432" "$f"
  grep -q "name: sdlc-console-placeholders" "$f"
  [ -f "${REPO_ROOT}/k3d/dev-stack/sdlc-console-secrets.yaml" ]
  [ -f "${REPO_ROOT}/k3d/dev-stack/sdlc-console-rbac.yaml" ]
}
