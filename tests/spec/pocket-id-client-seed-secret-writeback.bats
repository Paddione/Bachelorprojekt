#!/usr/bin/env bats
# tests/spec/pocket-id-client-seed-secret-writeback.bats
# SSOT: openspec/changes/pocket-id-client-seed-secret-writeback/specs/pocket-id-client-seed-secret-writeback.md (T001435)
#
# Verifies pocket-id-client-seed no longer rotates an EXISTING client's
# secret on every run (the root cause of the persistent "secret mismatch" /
# OIDC login failures on web.<brand>.de — the Job rotated the pocket-id-side
# secret on every deploy but never wrote the new value back into
# workspace-secrets, so apps kept reading a stale value). It must:
#   - skip the POST .../secret call entirely when updating an existing client
#   - still generate + immediately write back the secret when creating a
#     brand-new client, via the Job's own ServiceAccount token against the
#     in-cluster K8s API (RBAC scoped to exactly the workspace-secrets object)
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-secret-writeback.bats
# or:  task test:unit SPEC=pocket-id-client-seed-secret-writeback

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"
MANIFEST="${K3D}/pocket-id-client-seed.yaml"
RBAC="${K3D}/pocket-id-client-seed-rbac.yaml"

setup() {
  load 'test_helper'
}

@test "pocket-id-client-seed: existing-client branch does NOT call POST .../secret" {
  # Extract the block between the PUT update call and the matching "fi" /
  # else branch: it must contain no /secret POST anymore.
  run awk '/-X PUT -H "\$AUTH" -H "\$CT"/{f=1} f&&/else/{exit} f' "$MANIFEST"
  [ "$status" -eq 0 ]
  [[ "$output" != *"/secret\" </dev/null)"* ]] || {
    echo "existing-client branch still rotates the secret" >&2
    return 1
  }
}

@test "pocket-id-client-seed: create branch writes the generated secret back via patch_secret" {
  run grep -qE 'patch_secret "\$secret_key" "\$plaintext"' "$MANIFEST"
  [ "$status" -eq 0 ]
}

@test "pocket-id-client-seed: patch_secret uses the Job's own ServiceAccount token, not a hardcoded credential" {
  run grep -qF '${KSA_DIR}/token' "$MANIFEST"
  [ "$status" -eq 0 ]
}

@test "pocket-id-client-seed: Job runs under a dedicated (non-default) ServiceAccount" {
  run grep -qE 'serviceAccountName: pocket-id-client-seed' "$MANIFEST"
  [ "$status" -eq 0 ]
}

@test "pocket-id-client-seed-rbac: Role is scoped to exactly the workspace-secrets object" {
  run grep -qE 'resourceNames: \["workspace-secrets"\]' "$RBAC"
  [ "$status" -eq 0 ]
}

@test "pocket-id-client-seed-rbac: Role grants only get+patch, no broader verbs" {
  run grep -A1 'resourceNames: \["workspace-secrets"\]' "$RBAC"
  [ "$status" -eq 0 ]
  [[ "$output" == *'verbs: ["get", "patch"]'* ]]
}

@test "pocket-id-client-seed-rbac: is wired into the k3d kustomization" {
  run grep -qE 'pocket-id-client-seed-rbac\.yaml' "${K3D}/kustomization.yaml"
  [ "$status" -eq 0 ]
}
