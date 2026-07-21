#!/usr/bin/env bats
# tests/spec/mcp-gateway.bats
# SSOT: openspec/specs/mcp-gateway.md
#
# Covers: OAuth2 proxy MCP bypass, MCP server registration, ops agent output-trust.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── OAuth2 Proxy MCP Path Bypass ──────────────────────────────────────

@test "oauth2-proxy-dev.yaml exists" {
  [ -f "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml" ]
}

@test "oauth2-proxy-dev.yaml has --skip-auth-route for MCP paths" {
  run grep -q 'skip-auth-route' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

@test "oauth2-proxy-dev.yaml bypass includes kubernetes MCP path" {
  run grep -q 'kubernetes' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

@test "oauth2-proxy-dev.yaml bypass includes postgres MCP path" {
  run grep -q 'postgres' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

# ── MCP Server Registration ───────────────────────────────────────────

@test ".mcp.json exists with MCP server definitions" {
  [ -f "$REPO/.mcp.json" ]
}

@test ".mcp.json registers factory-mcp server" {
  run grep -q 'factory-mcp' "$REPO/.mcp.json"
  [ "$status" -eq 0 ]
}

@test ".mcp.json registers mcp-kubernetes server" {
  run grep -q 'mcp-kubernetes' "$REPO/.mcp.json"
  [ "$status" -eq 0 ]
}

@test ".mcp.json registers mcp-postgres server" {
  run grep -q 'mcp-postgres' "$REPO/.mcp.json"
  [ "$status" -eq 0 ]
}

# ── Ops Agent Output-Trust Guardrails ─────────────────────────────────

@test "bachelorprojekt-ops.md exists" {
  [ -f "$REPO/.claude/agents/bachelorprojekt-ops.md" ]
}

@test "ops agent has Output trust & shell-session integrity section" {
  run grep -qi 'output.*trust\|shell.*session.*integrity' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

@test "ops agent warns against fabricating diagnosis from unverified output" {
  run grep -qi 'fabricate\|do not conclude\|never.*diagnose.*unverified' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

@test "ops agent prescribes kubectl get nodes as verification probe" {
  run grep -q 'kubectl get nodes' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}
