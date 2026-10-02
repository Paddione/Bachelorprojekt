#!/usr/bin/env bats
# tests/spec/fleet-operations.bats
# SSOT: docs/superpowers/specs/2026-06-21-secrets-deploy-automation-design.md

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

# T900789: der Vergleich "fleet ⊇ legacy" entfiel mit den Legacy-Secret-Dateien;
# siehe tests/spec/fleet-operations/legacy-secrets-fleet.bats.

@test "prod/traefik-values.yaml does not set externalTrafficPolicy (invalid once type is ClusterIP)" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  # T001328 originally set this to "Local"; T001341 found live that the
  # Kubernetes API hard-rejects externalTrafficPolicy on a ClusterIP Service
  # ("may only be set for externally-accessible services") — it is not a
  # silent no-op as design.md assumed. Regression guard: this key must stay
  # absent (null) as long as service.spec.type is ClusterIP below.
  run yq eval '.service.spec.externalTrafficPolicy' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "null" ]
}

@test "prod/traefik-values.yaml runs Traefik as a DaemonSet on exactly the 3 public Hetzner nodes" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.deployment.kind' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "DaemonSet" ]

  # Regression guard: hostPort-based ingress only works on nodes that can
  # actually receive inbound DNS traffic. The node affinity MUST cover
  # exactly the nodes DNS for *.${PROD_DOMAIN} resolves to.
  run yq eval '.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values | sort | join(",")' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "pk-hetzner-4,pk-hetzner-6,pk-hetzner-8" ]
}

@test "prod/cloud-init.yaml installs Traefik from prod/traefik-values.yaml (not inline --set)" {
  run grep -c 'traefik-values.yaml' "${REPO_ROOT}/prod/cloud-init.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Regression guard against silently reverting to the old inline-flags
  # install, which had no externalTrafficPolicy/affinity at all. grep -c
  # exits 1 on zero matches, so don't assert on $status here — only on the
  # printed count.
  run grep -c -- '--set deployment.kind=DaemonSet' "${REPO_ROOT}/prod/cloud-init.yaml"
  [ "$output" -eq 0 ]
}

@test "prod-korczewski/traefik-values.yaml (orphaned, superseded by prod/traefik-values.yaml) is gone" {
  [ ! -f "${REPO_ROOT}/prod-korczewski/traefik-values.yaml" ]
}

# ── T001341: Traefik hostPort (client IP survives the klipper-lb hop) ─────
# T001328's externalTrafficPolicy: Local did not fix the bug live — root
# cause is k3s' ServiceLB (klipper-lb) re-originating the connection in its
# own pod netns when forwarding to the NodePort backend, which loses the
# real client IP before externalTrafficPolicy ever applies. Fix: Traefik's
# own pods bind ports 80/443 directly via hostPort (already committed below,
# just never live), with klipper-lb removed via service.spec.type: ClusterIP
# (the missing piece — without it, klipper-lb's svclb-traefik DaemonSet
# competes for the same hostPorts and the new Traefik pods stay Pending).
# Manifest-structure assertions only — see the manual rollout task in
# openspec/changes/traefik-hostport-clientip/tasks.md for live verification.

@test "prod/traefik-values.yaml sets service.spec.type: ClusterIP (removes klipper-lb)" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.service.spec.type' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "ClusterIP" ]
}

@test "prod/traefik-values.yaml exposes Traefik directly via hostPort 80/443" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.ports.web.hostPort' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "80" ]

  run yq eval '.ports.websecure.hostPort' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "443" ]
}

@test "prod/traefik-values.yaml uses maxUnavailable=1/maxSurge=0 (hostPort can't share a port)" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.updateStrategy.rollingUpdate.maxUnavailable' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]

  run yq eval '.updateStrategy.rollingUpdate.maxSurge' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}
