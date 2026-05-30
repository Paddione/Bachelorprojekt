#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# dev-mcp-route.bats — Structural guard for the dev MCP public route
# ═══════════════════════════════════════════════════════════════════
# The dev MCP monolith (claude-code-mcp-monolith, ns workspace-dev) is
# exposed at https://mcp.<DEV_DOMAIN>/{service}/mcp via:
#   - a dev-side token ForwardAuth (mcp-auth-proxy-dev) + IngressRoute
#     (mcp-dev) inside the k3d-mentolder-dev cluster, and
#   - a --skip-auth-route carve-out on the prod oauth2-proxy-dev that
#     bridges those MCP paths past the OIDC gate into the k3d cluster.
# These assertions ensure both halves stay wired (T000352).
# ═══════════════════════════════════════════════════════════════════

load test_helper

setup() {
  export DEV_DIR="${PROJECT_DIR}/k3d/dev-stack"
  export PROD_DIR="${PROJECT_DIR}/prod-mentolder"
  export DEV_RENDERED="${BATS_TEST_TMPDIR}/dev-stack.yaml"
  export PROD_RENDERED="${BATS_TEST_TMPDIR}/prod-mentolder.yaml"

  if [[ ! -f "$DEV_RENDERED" ]]; then
    kubectl kustomize "${DEV_DIR}" --load-restrictor=LoadRestrictionsNone > "$DEV_RENDERED" 2>&1 \
      || { echo "dev-stack kustomize failed:" >&2; cat "$DEV_RENDERED" >&2; return 1; }
  fi
  if [[ ! -f "$PROD_RENDERED" ]]; then
    kubectl kustomize "${PROD_DIR}" --load-restrictor=LoadRestrictionsNone > "$PROD_RENDERED" 2>&1 \
      || { echo "prod-mentolder kustomize failed:" >&2; cat "$PROD_RENDERED" >&2; return 1; }
  fi
}

@test "dev-stack renders the mcp-auth-proxy-dev Deployment" {
  run grep -E "name: mcp-auth-proxy-dev$" "$DEV_RENDERED"
  assert_success
}

@test "dev-stack mcp-auth-proxy-dev reads CLUSTER_TOKEN from the mcp-tokens secret" {
  run grep -E "name: mcp-tokens" "$DEV_RENDERED"
  assert_success
  run grep -E "key: CLUSTER_TOKEN" "$DEV_RENDERED"
  assert_success
}

@test "dev-stack renders the mcp-dev IngressRoute on the mcp host" {
  run grep -E "name: mcp-dev$" "$DEV_RENDERED"
  assert_success
  # host is mcp.<DEV_DOMAIN> — the ${DEV_DOMAIN} placeholder is envsubst'd at apply time
  run grep -E "Host\(.mcp\." "$DEV_RENDERED"
  assert_success
}

@test "dev-stack mcp-dev routes all four MCP path prefixes to the monolith" {
  for prefix in kubernetes postgres github browser; do
    run grep -F "PathPrefix(\`/${prefix}\`)" "$DEV_RENDERED"
    assert_success
  done
  run grep -E "name: claude-code-mcp-monolith" "$DEV_RENDERED"
  assert_success
}

@test "dev-stack mcp-dev wires the ForwardAuth chain to mcp-auth-proxy-dev" {
  run grep -E "mcp-auth-proxy-dev.workspace-dev.svc.cluster.local" "$DEV_RENDERED"
  assert_success
  run grep -E "name: mcp-dev-chain" "$DEV_RENDERED"
  assert_success
}

@test "prod oauth2-proxy-dev carves out the MCP paths via --skip-auth-route" {
  run grep -F -- "--skip-auth-route=^/(kubernetes|postgres|github|browser)" "$PROD_RENDERED"
  assert_success
}
