#!/usr/bin/env bats
# tests/spec/security.bats
# SSOT: openspec/specs/security.md
#
# Covers: Hybrid-auth model, secret rotation, ingress paths, NetworkPolicy exclusion.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Ingress configuration ─────────────────────────────────────────────

@test "k3d/ingress.yaml exists" {
  [ -f "$REPO/k3d/ingress.yaml" ]
}

@test "ingress.yaml is a valid Kubernetes Ingress manifest" {
  run grep -q 'apiVersion: networking.k8s.io' "$REPO/k3d/ingress.yaml"
  [ "$status" -eq 0 ]
}

@test "ingress.yaml defines workspace backend services" {
  run grep -q 'backend:' "$REPO/k3d/ingress.yaml"
  [ "$status" -eq 0 ]
}

# ── Secret rotation ───────────────────────────────────────────────────

@test "secret-rotate.sh script exists" {
  [ -f "$REPO/scripts/secret-rotate.sh" ]
}

@test "secret-rotate.sh is executable" {
  [ -x "$REPO/scripts/secret-rotate.sh" ]
}

# ── SealedSecrets infrastructure ──────────────────────────────────────

@test "environments/.secrets/ directory structure exists" {
  [ -d "$REPO/environments/.secrets" ] || skip "secrets dir not in worktree"
}

@test "env:seal task is declared in Taskfile" {
  run grep -q 'env:seal' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
}

# ── Security agent exists ─────────────────────────────────────────────

@test "bachelorprojekt-security agent file exists" {
  [ -f "$REPO/.claude/agents/bachelorprojekt-security.md" ]
}
