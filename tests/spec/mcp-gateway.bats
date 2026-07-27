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

# ── MCP Registry SSOT (abgelöst: hartcodierte .mcp.json-Tests) ──────────

@test "SSOT registry mcp.yaml exists with clients and cluster" {
  [ -f "$REPO/docs/agent-guide/registry/mcp.yaml" ]
  run bash -c "node -e \"const fs=require('fs'),y=require('yaml');const d=y.parse(fs.readFileSync('$REPO/docs/agent-guide/registry/mcp.yaml','utf8'));console.log(Object.keys(d.clients).length,Object.keys(d.cluster).length)\""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+[[:space:]]+[0-9]+ ]]
}

@test "mcp-sync.sh check passes (registry matches generated configs)" {
  run bash "$REPO/scripts/mcp-sync.sh" check
  echo "output: $output"
  [ "$status" -eq 0 ]
}

@test "mcp-sync.sh check is read-only (never writes)" {
  local before_sum after_sum
  before_sum=$(md5sum "$REPO/.mcp.json" "$REPO/.opencode/opencode.jsonc" 2>/dev/null | md5sum)
  run bash "$REPO/scripts/mcp-sync.sh" check
  after_sum=$(md5sum "$REPO/.mcp.json" "$REPO/.opencode/opencode.jsonc" 2>/dev/null | md5sum)
  echo "before: $before_sum after: $after_sum"
  [ "$before_sum" = "$after_sum" ]
}

@test "mcp-sync.sh check skips agy target with visible message" {
  if [ -f "$HOME/.gemini/config/mcp_config.json" ]; then
    skip "agy target exists on this machine — test only applies in CI"
  fi
  run bash "$REPO/scripts/mcp-sync.sh" check
  echo "output: $output"
  [[ "$output" =~ skipped ]]
}

@test "cluster container names match deployment manifest" {
  run grep -c '"name": "keycloak"\|"name": "playwright"\|"name": "github"' \
    "$REPO/k3d/default/claude-code-mcp-monolith-deploy.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 3 ]
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
