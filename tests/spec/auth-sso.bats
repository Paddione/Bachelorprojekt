#!/usr/bin/env bats
# tests/spec/auth-sso.bats
# SSOT: openspec/specs/auth-sso.md
# T001579: oauth2-proxy gate hardening — render-based manifest assertions.
# Render pattern follows tests/spec/brain-quartz-deploy.bats.
load 'test_helper'

_render_mentolder() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  kubectl kustomize "$REPO_ROOT/prod-fleet/mentolder" --load-restrictor=LoadRestrictionsNone 2>/dev/null
}

_render_korczewski() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  kubectl kustomize "$REPO_ROOT/prod-fleet/korczewski" --load-restrictor=LoadRestrictionsNone 2>/dev/null
}

@test "prod render (mentolder): no --ssl-insecure-skip-verify anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--ssl-insecure-skip-verify' <<< "$RENDER" || { echo "FAIL: ssl-insecure-skip-verify still rendered"; return 1; }
}

@test "prod render (mentolder): no --insecure-oidc-allow-unverified-email anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--insecure-oidc-allow-unverified-email' <<< "$RENDER" || { echo "FAIL: insecure-oidc-allow-unverified-email still rendered"; return 1; }
}

@test "prod render (mentolder): no wildcard --email-domain=* anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--email-domain=\*' <<< "$RENDER" || { echo "FAIL: email-domain=* still rendered"; return 1; }
}

@test "prod render (mentolder): exactly 8 gates carry --allowed-groups=workspace-users" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --allowed-groups=workspace-users' <<< "$RENDER" || true)"
  [ "$count" -eq 8 ] || { echo "FAIL: expected 8 allowed-groups gates, got ${count}"; return 1; }
}

@test "prod render (mentolder): exactly 8 gates carry --oidc-groups-claim=groups" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --oidc-groups-claim=groups' <<< "$RENDER" || true)"
  [ "$count" -eq 8 ] || { echo "FAIL: expected 8 oidc-groups-claim gates, got ${count}"; return 1; }
}

@test "prod render (mentolder): exactly 8 gates request the groups scope" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --scope=openid email profile groups' <<< "$RENDER" || true)"
  [ "$count" -eq 8 ] || { echo "FAIL: expected 8 gates with groups scope, got ${count}"; return 1; }
}

@test "prod render (mentolder): the 3 allowlist gates keep --authenticated-emails-file" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --authenticated-emails-file' <<< "$RENDER" || true)"
  [ "$count" -eq 3 ] || { echo "FAIL: expected 3 authenticated-emails-file gates, got ${count}"; return 1; }
}

@test "prod render (korczewski): no insecure flags anywhere" {
  RENDER="$(_render_korczewski)"
  ! grep -qE -- '--(ssl-insecure-skip-verify|insecure-oidc-allow-unverified-email)' <<< "$RENDER" || { echo "FAIL: insecure flag rendered on korczewski"; return 1; }
  ! grep -q -- '--email-domain=\*' <<< "$RENDER" || { echo "FAIL: email-domain=* rendered on korczewski"; return 1; }
}

@test "pocket-id seed job provisions the workspace-users group idempotently" {
  grep -q 'workspace-users' k3d/pocket-id-client-seed.yaml || { echo "FAIL: workspace-users group missing in seed job"; return 1; }
  grep -q '/api/user-groups' k3d/pocket-id-client-seed.yaml || { echo "FAIL: user-groups API call missing in seed job"; return 1; }
  grep -q 'ensure_group' k3d/pocket-id-client-seed.yaml || { echo "FAIL: ensure_group helper missing in seed job"; return 1; }
}

@test "orphaned templates/brain/prod-korczewski subtree is gone" {
  [ ! -d templates/brain/prod-korczewski ] || { echo "FAIL: templates/brain/prod-korczewski still exists"; return 1; }
}