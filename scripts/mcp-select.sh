#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# mcp-select.sh — Interactive MCP server selector
# Generates a .mcp.json for Claude Code based on selected environment
# and MCP servers.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT="$PROJECT_DIR/.mcp.json"

# ── MCP server registry ────────────────────────────────────────────
# Format: name|service|port|path|description
SERVERS=(
  "kubernetes|claude-code-mcp-ops|3000|/mcp|Kubernetes cluster management (read-only)"
  "postgres|claude-code-mcp-ops|3001|/mcp|PostgreSQL database access"
  "meetings|claude-code-mcp-ops|3002|/mcp|Meeting transcripts and insights"
  "nextcloud|claude-code-mcp-apps|8000|/sse|Nextcloud file management"
  "keycloak|claude-code-mcp-auth|8080|/sse|Keycloak SSO/OIDC"
  "stripe|claude-code-mcp-stripe|3000|/mcp|Stripe payment gateway"
  "browser|mcp-browser|3000|/mcp|Playwright browser automation"
  "github|mcp-github|3000|/mcp|GitHub repository integration"
  "prometheus|mcp-prometheus|3000|/mcp|Prometheus metrics"
  "grafana|mcp-grafana|3000|/mcp|Grafana dashboards"
)

# ── Environment selection ───────────────────────────────────────────
echo "╔══════════════════════════════════════════╗"
echo "║   MCP Server Selector for Claude Code    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Select environment:"
echo "  1) local   — k3d cluster (*.workspace.svc.cluster.local)"
echo "  2) prod    — production  (*.workspace.svc.cluster.local)"
echo ""
read -rp "Environment [1]: " env_choice
env_choice="${env_choice:-1}"

NAMESPACE="workspace"

case "$env_choice" in
  1) BASE_DOMAIN="workspace.svc.cluster.local" ;;
  2) BASE_DOMAIN="workspace.svc.cluster.local" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

# ── Server selection ────────────────────────────────────────────────
echo ""
echo "Available MCP servers:"
echo "──────────────────────────────────────────────"
for i in "${!SERVERS[@]}"; do
  IFS='|' read -r name _ _ _ desc <<< "${SERVERS[$i]}"
  printf "  %2d) %-15s %s\n" "$((i + 1))" "$name" "$desc"
done
echo ""
echo "  a) All servers"
echo ""
read -rp "Select servers (comma-separated numbers, or 'a' for all) [a]: " selection
selection="${selection:-a}"

# ── Parse selection ─────────────────────────────────────────────────
selected=()
if [[ "$selection" == "a" ]]; then
  for i in "${!SERVERS[@]}"; do
    selected+=("$i")
  done
else
  IFS=',' read -ra choices <<< "$selection"
  for choice in "${choices[@]}"; do
    choice="$(echo "$choice" | tr -d ' ')"
    idx=$((choice - 1))
    if [[ $idx -ge 0 && $idx -lt ${#SERVERS[@]} ]]; then
      selected+=("$idx")
    else
      echo "Warning: ignoring invalid selection '$choice'"
    fi
  done
fi

if [[ ${#selected[@]} -eq 0 ]]; then
  echo "No servers selected. Aborting."
  exit 1
fi

# ── Generate .mcp.json ─────────────────────────────────────────────
echo ""
echo "Generating $OUTPUT ..."

json='{\n  "mcpServers": {'
first=true
for idx in "${selected[@]}"; do
  IFS='|' read -r name service port path _ <<< "${SERVERS[$idx]}"
  url="http://${service}.${BASE_DOMAIN}:${port}${path}"

  if $first; then
    first=false
  else
    json+=','
  fi
  json+="\n    \"${name}\": {\n      \"url\": \"${url}\"\n    }"
done
json+='\n  }\n}'

echo -e "$json" > "$OUTPUT"

echo ""
echo "Written $(echo "${selected[@]}" | wc -w | tr -d ' ') server(s) to $OUTPUT"
echo ""
echo "Selected servers:"
for idx in "${selected[@]}"; do
  IFS='|' read -r name service port path desc <<< "${SERVERS[$idx]}"
  echo "  - $name → http://${service}.${BASE_DOMAIN}:${port}${path}"
done
