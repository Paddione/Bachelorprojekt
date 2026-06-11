#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# staging.bats — offline unit tests for T000616 staging-on-demand
#
# Tests:
#   1-6  staging-id.sh: branch sanitization rules
#   7    staging-id.sh: empty-result guard
#   8    kustomize build dry-run (offline, envsubst substitution check)
# ═══════════════════════════════════════════════════════════════════

load test_helper

STAGING_ID_SCRIPT="${PROJECT_DIR}/scripts/staging-id.sh"
STAGING_STACK="${PROJECT_DIR}/k3d/staging-stack"

# ── staging-id.sh tests ──────────────────────────────────────────

@test "staging-id: feature branch produces lowercase alphanumeric id" {
  run bash "$STAGING_ID_SCRIPT" "feature/T000616-staging-on-demand"
  [ "$status" -eq 0 ]
  # Must be only [a-z0-9-]
  [[ "$output" =~ ^[a-z0-9][a-z0-9-]*$ ]]
}

@test "staging-id: result is at most 20 characters" {
  run bash "$STAGING_ID_SCRIPT" "feature/T000616-staging-on-demand"
  [ "$status" -eq 0 ]
  [ "${#output}" -le 20 ]
}

@test "staging-id: short branch name passes through cleanly" {
  run bash "$STAGING_ID_SCRIPT" "main"
  [ "$status" -eq 0 ]
  [ "$output" = "main" ]
}

@test "staging-id: strips refs/heads/ prefix" {
  run bash "$STAGING_ID_SCRIPT" "refs/heads/feature/abc"
  [ "$status" -eq 0 ]
  [ "$output" = "feature-abc" ]
}

@test "staging-id: slashes and underscores become dashes" {
  run bash "$STAGING_ID_SCRIPT" "fix/my_branch"
  [ "$status" -eq 0 ]
  [ "$output" = "fix-my-branch" ]
}

@test "staging-id: id starting with digit gets s- prefix" {
  run bash "$STAGING_ID_SCRIPT" "123-feature"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[a-z] ]]
}

@test "staging-id: consecutive separators collapse to single dash" {
  run bash "$STAGING_ID_SCRIPT" "fix//double--slash"
  [ "$status" -eq 0 ]
  [[ ! "$output" =~ -- ]]
}

@test "staging-id: deterministic — same branch always gives same id" {
  BRANCH="feature/T000616-staging-on-demand"
  run bash "$STAGING_ID_SCRIPT" "$BRANCH"
  FIRST="$output"
  run bash "$STAGING_ID_SCRIPT" "$BRANCH"
  [ "$output" = "$FIRST" ]
}

# ── kustomize build dry-run ──────────────────────────────────────

@test "kustomize build of staging-stack succeeds with placeholder vars" {
  # Requires: kustomize or kubectl with kustomize support
  if ! command -v kubectl >/dev/null 2>&1; then
    skip "kubectl not available (offline CI)"
  fi
  export STAGING_NS="workspace-staging-test"
  export STAGING_ID="test"
  export STAGING_IMAGE="ghcr.io/paddione/workspace-website:staging-test"
  run bash -c "kubectl kustomize '${STAGING_STACK}/' \
    | envsubst '\$STAGING_NS \$STAGING_ID \$STAGING_IMAGE'"
  [ "$status" -eq 0 ]
  # Output should contain our namespace name
  [[ "$output" == *"workspace-staging-test"* ]]
  # Output should contain the image reference
  [[ "$output" == *"ghcr.io/paddione/workspace-website:staging-test"* ]]
}

@test "kustomize build contains expected resource kinds" {
  if ! command -v kubectl >/dev/null 2>&1; then
    skip "kubectl not available (offline CI)"
  fi
  export STAGING_NS="workspace-staging-test"
  export STAGING_ID="test"
  export STAGING_IMAGE="ghcr.io/paddione/workspace-website:staging-test"
  run bash -c "kubectl kustomize '${STAGING_STACK}/' \
    | envsubst '\$STAGING_NS \$STAGING_ID \$STAGING_IMAGE'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"kind: Namespace"* ]]
  [[ "$output" == *"kind: StatefulSet"* ]]
  [[ "$output" == *"kind: Deployment"* ]]
  [[ "$output" == *"kind: Ingress"* ]]
  [[ "$output" == *"kind: Job"* ]]
}

@test "staging-db-anonymize.sh is executable and has correct shebang" {
  SCRIPT="${PROJECT_DIR}/scripts/staging-db-anonymize.sh"
  [ -f "$SCRIPT" ]
  [ -x "$SCRIPT" ]
  head -1 "$SCRIPT" | grep -q "#!/usr/bin/env bash"
}

@test "staging-db-anonymize.sh fails when PGPORT is unset" {
  run env -i HOME="$HOME" bash "${PROJECT_DIR}/scripts/staging-db-anonymize.sh"
  [ "$status" -ne 0 ]
  # Should error on missing PGPORT
  [[ "$output" =~ "PGPORT" ]] || [[ "$stderr" =~ "PGPORT" ]]
}
