#!/usr/bin/env bats
# Verify backup-restore.sh fully honors --namespace (no workspace hardcodes leak
# into rendered kubectl args / secret refs when a non-default ns is passed).

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/backup-restore.sh"
}

@test "no hardcoded '-n workspace' remains outside the NS default assignment" {
  # Allow the single default assignment 'NS=workspace'; forbid literal '-n workspace'
  run grep -nE -- '-n workspace([^-]|$)' "$SCRIPT"
  [ "$status" -ne 0 ]
}

@test "kubectl secret lookups for workspace-secrets pass -n \$NS" {
  # 'workspace-secrets' is a Secret NAME, correct in any namespace, so its
  # appearances inside YAML heredocs (name: workspace-secrets / secretKeyRef) and
  # in echo/ERROR message strings are fine. The real invariant: any actual kubectl
  # ($KC) command that reads/writes the workspace-secrets Secret must carry
  # -n "$NS" so a korczewski restore lands in workspace-korczewski, not workspace.
  run bash -c "grep -nE '(kubectl|\\\$KC)[^#]*secret[^#]*workspace-secrets' '$SCRIPT' | grep -v -- '-n \"\$NS\"' || true"
  [ -z "$output" ]
}
