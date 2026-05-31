#!/usr/bin/env bats
# tests/dev-stack/dev-mcp-public.bats
# Reproduction + smoke test for the dev MCP public route [T000363].
#
# Bug (red): after the mentolder-standalone decommission (2026-05-30) uninstalled
# standalone-k3s from k3s-1, the dev k3d stack lost its 443 TLS terminator,
# wildcard cert, and oauth2-proxy-dev SSO/skip-auth gate. Nothing listens on
# k3s-1:443, so https://mcp.dev.${PROD_DOMAIN}/{kubernetes,postgres}/mcp is
# externally connection-refused and the kubernetes/postgres MCP servers show
# "Failed to connect" in clients.
#
# Target (green): the self-contained k3d design serves a valid TLS wildcard for
# *.dev.mentolder.de and routes the token-authed MCP path prefixes to the dev
# monolith, returning a JSON-RPC initialize result.
#
# Gated. Requires:
#   RUN_DEV_TESTS=true
#   DEV_MCP_TOKEN=<mcp-auth-proxy-dev CLUSTER_TOKEN>   (the ?token= query value)

setup() {
  : "${RUN_DEV_TESTS:?Gated tests — set RUN_DEV_TESTS=true to run}"
  : "${DEV_MCP_TOKEN:?Set DEV_MCP_TOKEN to the dev MCP CLUSTER_TOKEN}"
  MCP_HOST="${MCP_HOST:-mcp.dev.mentolder.de}"
  INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"bats","version":"1"}}}'
}

# Helper: POST an MCP initialize to a service path-prefix, echo the body.
_mcp_init() {
  local prefix="$1"
  curl -sS --max-time 15 \
    -X POST "https://${MCP_HOST}/${prefix}/mcp?token=${DEV_MCP_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$INIT_BODY"
}

@test "dev-mcp-public.1: server cert is valid for \$MCP_HOST (not the Traefik default)" {
  run bash -c "echo | openssl s_client -servername $MCP_HOST -connect $MCP_HOST:443 -verify_return_error </dev/null 2>&1"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'Verify return code: 0' || { echo "TLS verify failed:"; echo "$output" | tail -5; return 1; }
  echo "$output" | grep -qi 'TRAEFIK DEFAULT CERT' && { echo "Got Traefik default self-signed cert"; return 1; }
  return 0
}

@test "dev-mcp-public.2: /kubernetes/mcp returns a JSON-RPC initialize result" {
  run _mcp_init kubernetes
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"jsonrpc"' || { echo "No JSON-RPC response; got:"; echo "$output"; return 1; }
  echo "$output" | grep -q '"result"' || { echo "No result (error or auth failure); got:"; echo "$output"; return 1; }
}

@test "dev-mcp-public.3: /postgres/mcp returns a JSON-RPC initialize result" {
  run _mcp_init postgres
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"jsonrpc"' || { echo "No JSON-RPC response; got:"; echo "$output"; return 1; }
  echo "$output" | grep -q '"result"' || { echo "No result (error or auth failure); got:"; echo "$output"; return 1; }
}
