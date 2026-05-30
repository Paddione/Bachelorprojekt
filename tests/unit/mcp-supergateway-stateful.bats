#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# mcp-supergateway-stateful.bats — Regression guard for T000360
# ═══════════════════════════════════════════════════════════════════
# supergateway's stdio→streamableHttp bridge only emits an
# Mcp-Session-Id header (required by the claude.ai / Claude Code MCP
# HTTP client) when run with --stateful. Without it the postgres,
# github and browser MCP servers return a valid `initialize` but no
# session id, and the client reports "Failed to connect" (only the
# native kubernetes server, which is NOT supergateway-fronted, works).
#
# Every supergateway invocation in both monolith manifests MUST carry
# --stateful. Asserted structurally so CI catches a regression without
# a live cluster. (kubernetes container is native streamableHttp and
# is intentionally NOT supergateway-fronted, so it is exempt.)
# ═══════════════════════════════════════════════════════════════════

load test_helper

# Both monolith manifests (prod default-ns + dev k3d variant).
MANIFESTS=(
  "deploy/mcp/claude-code-mcp-monolith.yaml"
  "k3d/dev-stack/mcp-monolith-dev.yaml"
)

@test "every supergateway streamableHttp invocation passes --stateful (both monoliths)" {
  for rel in "${MANIFESTS[@]}"; do
    local f="${PROJECT_DIR}/${rel}"
    [[ -f "$f" ]] || fail "manifest not found: $rel"

    # supergateway is used once per stdio→streamableHttp bridge; each such
    # bridge is marked by `--outputTransport streamableHttp`.
    local bridges stateful
    # grep -c exits 1 on zero matches; `|| true` keeps the count (0) without tripping bats.
    bridges=$(grep -c -- "--outputTransport streamableHttp" "$f" || true)
    stateful=$(grep -c -- "--stateful" "$f" || true)

    [[ "$bridges" -ge 1 ]] || fail "$rel: expected at least one supergateway streamableHttp bridge, found $bridges"
    [[ "$stateful" -eq "$bridges" ]] || \
      fail "$rel: $bridges supergateway streamableHttp bridge(s) but only $stateful carry --stateful (must match)"
  done
}
