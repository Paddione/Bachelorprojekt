#!/usr/bin/env bats
# tests/spec/openspec-pgvector.bats
# SSOT: openspec/specs/openspec-pgvector.md
#
# Covers: openspec-embed.mjs CLI, search API, plan-context --semantic, MCP tool.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Standalone Embed CLI ──────────────────────────────────────────────

@test "openspec-embed.mjs exists" {
  [ -f "$REPO/scripts/openspec-embed.mjs" ]
}

@test "openspec-embed.mjs supports --dry-run flag" {
  run grep -q 'dry-run\|dry_run\|dryRun' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "openspec-embed.mjs references LLM gateway embed endpoint" {
  run grep -q 'llm-gateway-embed\|embed.*gateway' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "openspec-embed.mjs upserts into knowledge.chunks" {
  run grep -q 'knowledge.chunks\|knowledge.*chunks' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

# ── plan-context.sh --semantic flag ───────────────────────────────────

@test "plan-context.sh exists" {
  [ -f "$REPO/scripts/plan-context.sh" ]
}

@test "plan-context.sh supports --semantic flag" {
  run grep -q '\-\-semantic' "$REPO/scripts/plan-context.sh"
  [ "$status" -eq 0 ]
}

@test "plan-context.sh queries /api/openspec/search for semantic results" {
  run grep -q '/api/openspec/search' "$REPO/scripts/plan-context.sh"
  [ "$status" -eq 0 ]
}

# ── Search API endpoint ───────────────────────────────────────────────

@test "openspec search API route exists" {
  [ -f "$REPO/website/src/pages/api/openspec/search.ts" ]
}

# ── MCP tool ──────────────────────────────────────────────────────────

@test "factory-mcp server script exists" {
  [ -f "$REPO/scripts/factory/mcp-server.mjs" ]
}

@test "factory-mcp registers openspec_find_similar tool" {
  run grep -q 'openspec_find_similar\|openspec.*find.*similar' "$REPO/scripts/factory/mcp-server.mjs"
  [ "$status" -eq 0 ]
}
