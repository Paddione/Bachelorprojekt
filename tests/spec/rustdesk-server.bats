#!/usr/bin/env bats
# tests/spec/rustdesk-server.bats
# SSOT: openspec/specs/rustdesk-server.md (post-archive)
# Renders k3d/rustdesk-stack offline and asserts the hbbs/hbbr contract.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  STACK="${REPO_ROOT}/k3d/rustdesk-stack"
}

@test "rustdesk: kustomize build k3d/rustdesk-stack succeeds (no broken refs)" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  run kustomize build "$STACK"
  [ "$status" -eq 0 ]
}

@test "rustdesk: namespace enforces privileged PSA" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'kind:[[:space:]]+Namespace'
  echo "$out" | grep -qE 'pod-security.kubernetes.io/enforce:[[:space:]]*privileged'
}

@test "rustdesk: hbbs + hbbr run on hostNetwork, pinned to \${TURN_NODE}" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  # two Deployments
  [ "$(echo "$out" | grep -cE '^kind:[[:space:]]+Deployment')" -eq 2 ]
  echo "$out" | grep -qE 'hostNetwork:[[:space:]]*true'
  echo "$out" | grep -qE 'kubernetes.io/hostname:[[:space:]]*\$\{TURN_NODE\}'
}

@test "rustdesk: hbbs exposes 21115/tcp and 21116 tcp+udp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21115'
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21116'
  # 21116 must appear for both TCP and UDP
  [ "$(echo "$out" | grep -cE 'containerPort:[[:space:]]*21116')" -ge 2 ]
}

@test "rustdesk: hbbr exposes 21117/tcp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21117'
}

@test "rustdesk: web-client ports 21118/21119 are absent" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  ! echo "$out" | grep -qE '2111[89]'
}

@test "rustdesk: image is digest-pinned" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'image:[[:space:]]*rustdesk/rustdesk-server:[^@]+@sha256:[0-9a-f]{64}'
}
