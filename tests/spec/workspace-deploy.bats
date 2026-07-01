#!/usr/bin/env bats
# tests/spec/workspace-deploy.bats
# SSOT: openspec/specs/workspace-deploy.md
# Covers T001396: Pocket-ID SMTP wiring (SMTP_USER unsubstituted in prod,
# missing POCKET_ID_SMTP_TLS derivation).
# Uses simple [ ... ] assertions (matches tests/spec/* convention).

load 'test_helper'

TASKFILE="${PROJECT_DIR}/Taskfile.yml"
POCKET_ID_MANIFEST="${PROJECT_DIR}/k3d/pocket-id.yaml"

# Extracts the workspace:deploy task body (from its header to the next
# top-level task header) so assertions only look at ENVSUBST_VARS lines
# belonging to this task, not e.g. the dev-branch literal envsubst call
# (which already lists $SMTP_USER correctly) or unrelated tasks.
_workspace_deploy_block() {
  sed -n '/^  workspace:deploy:$/,/^  workspace:partial-deploy:$/p' "$TASKFILE"
}

_workspace_partial_deploy_block() {
  sed -n '/^  workspace:partial-deploy:$/,/^  workspace:fix-tickets-grants:$/p' "$TASKFILE"
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "k3d/pocket-id.yaml wires an SMTP_TLS container env" {
  run grep -c 'name: SMTP_TLS' "$POCKET_ID_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "workspace:deploy dev branch still envsubsts \$SMTP_USER (no regression)" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep 'kustomize build k3d/' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}
