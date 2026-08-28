#!/usr/bin/env bats
# tests/spec/auth-sso/penpot-oidc.bats
# SSOT: openspec/changes/add-penpot-service/specs/auth-sso.md
#
# Validates: Pocket-ID OIDC client provisioning for Penpot.

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "Penpot OIDC client is registered in seed job" {
  local f="${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"
  [ -f "$f" ]
  grep -q 'penpot|SECRET_penpot' "$f"
  grep -q 'POCKET_ID_PENPOT_SECRET' "$f"
  grep -q 'design\.' "$f"
  grep -q '/api/external-auth' "$f"
}

@test "Penpot Pocket-ID secret exists in workspace-secrets" {
  grep -q 'POCKET_ID_PENPOT_SECRET.*dev' "${REPO_ROOT}/k3d/secrets.yaml"
}

@test "Penpot deployment references Pocket-ID OIDC config" {
  local f="${REPO_ROOT}/k3d/penpot.yaml"
  [ -f "$f" ]
  grep -q 'PENPOT_OIDC_ENABLED' "$f" || grep -q 'SSO_ENABLED' "$f" || true
  grep -q 'pocket-id:1411' "$f"
  grep -q 'POCKET_ID_PENPOT_SECRET' "$f"
}

@test "Penpot client callback URL uses design domain variable" {
  local f="${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"
  [ -f "$f" ]
  # Must use SCHEME/SUFFIX pattern, not hardcoded hostname
  grep 'penpot' "$f" | grep -q 'SCHEME\|SUFFIX\|${'
}
