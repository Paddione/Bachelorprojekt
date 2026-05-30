#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# brainstorm-dev-host.bats — Guard for the brainstorm broker living on
# the dev node, not the prod mentolder cluster (T000364)
# ═══════════════════════════════════════════════════════════════════
# brainstorm.mentolder.de used to be served by a dedicated sish broker
# in the prod-mentolder overlay (gekko-hetzner-2), but DNS CNAMEs the
# hostname to dev.mentolder.de (k3s-1), so the public host 404'd: the
# request hit the dev node which had no route for it. Source of truth
# is the dev node — the brainstorm tunnel now rides the existing
# dev-stack sish on *.dev.mentolder.de (brainstorm.dev.mentolder.de),
# and the prod broker is removed.
# ═══════════════════════════════════════════════════════════════════

load test_helper

setup() {
  export PROD_OVERLAY="${PROJECT_DIR}/prod-mentolder"
  export FLEET_OVERLAY="${PROJECT_DIR}/prod-fleet/mentolder"
  export DEV_SISH="${PROJECT_DIR}/k3d/dev-stack/sish.yaml"
  export BRAINSTORM_TASKFILE="${PROJECT_DIR}/Taskfile.brainstorm.yml"
}

@test "prod-mentolder no longer ships a dedicated brainstorm-sish manifest" {
  assert [ ! -f "${PROD_OVERLAY}/brainstorm-sish.yaml" ]
}

@test "prod-mentolder kustomization does not reference brainstorm-sish" {
  run grep -F "brainstorm-sish" "${PROD_OVERLAY}/kustomization.yaml"
  assert_failure
}

@test "prod-fleet/mentolder kustomization does not patch brainstorm-sish" {
  run grep -F "brainstorm-sish" "${FLEET_OVERLAY}/kustomization.yaml"
  assert_failure
}

@test "the dev-stack sish broker (the new brainstorm host) is present and binds *.dev.<domain>" {
  run grep -E "name: sish$" "$DEV_SISH"
  assert_success
  run grep -F -- "--bind-hosts=*.\${DEV_DOMAIN}" "$DEV_SISH"
  assert_success
}

@test "brainstorm Taskfile publishes to the dev domain, not the prod domain" {
  run grep -F "brainstorm.\${PROD_DOMAIN}" "$BRAINSTORM_TASKFILE"
  assert_failure
  run grep -F "brainstorm.mentolder.de" "$BRAINSTORM_TASKFILE"
  assert_failure
  run grep -F "\${DEV_DOMAIN}" "$BRAINSTORM_TASKFILE"
  assert_success
}

@test "brainstorm Taskfile targets the dev sish SSH ingress :2222, not the removed prod broker NodePort 32223" {
  run grep -F "32223" "$BRAINSTORM_TASKFILE"
  assert_failure
  # The dev sish SSH endpoint is the k3d loadbalancer host port 2222
  # (0.0.0.0:2222 → dev.mentolder.de), same as `task dev:tunnel`. Set via
  # `SSH_PORT: 2222`. ("32223" contains no 4-long run of 2s, so a bare
  # "2222" match is unambiguous.)
  run grep -F "2222" "$BRAINSTORM_TASKFILE"
  assert_success
}
