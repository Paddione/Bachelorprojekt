#!/usr/bin/env bash
# scripts/mcp-gateway/start-mcp-unified.sh
# Unified MCP server launcher for Windows/WSL — no systemd required.
#
# Starts the three MCP infrastructure components that serve the red MCP servers
# in opencode:
#   1. mcp-gateway    (kubectl port-forward → mcp-kubernetes :18080, mcp-postgres :13001)
#   2. factory-mcp    (Node.js stdlib → factory-mcp-node :13003)
#   3. bge-mcp shim   (Node.js → bge-mcp :13005)
#
# Usage:
#   scripts/mcp-gateway/start-mcp-unified.sh   # start all
#   scripts/mcp-gateway/start-mcp-unified.sh stop   # stop all, clean up PID files
#   scripts/mcp-gateway/start-mcp-unified.sh status   # health check
#
# PID files (all under /tmp):
#   /tmp/mcp-gateway.pid     — kubectl port-forward process group
#   /tmp/factory-mcp.pid     — factory-mcp-node server
#   /tmp/bge-mcp.pid         — bge-mcp shim
#
# Idempotent: if a process is already running on its port, it is skipped.
# Safe to call repeatedly.

set -euo pipefail

# Resolve repo root from the script's location.
# The script lives at <repo>/scripts/mcp-gateway/start-mcp-unified.sh
# → two levels up from the script's directory = repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── pre-load all tokens so downstream functions and the shell have them ─────
for _envfile in \
  "$HOME/.config/bge-mcp/server.env" \
  "$HOME/.config/factory-mcp-node/server.env" \
  "$HOME/.config/mcp-postgres/server.env" \
  "$HOME/.config/mcp-cors-proxy/server.env"; do
  [[ -f "$_envfile" ]] || continue
  while IFS='=' read -r _k _v; do
    case "$_k" in
      BGE_MCP_TOKEN|FACTORY_MCP_TOKEN|MCP_POSTGRES_TOKEN|MCP_KUBERNETES_TOKEN)
        export "$_k"="$_v"
        ;;
    esac
  done < "$_envfile"
done
unset _envfile _k _v 2>/dev/null || true
PID_DIR="/tmp"

# --- helpers ---------------------------------------------------------------

pid_file() { echo "${PID_DIR}/$1.pid"; }

is_running() {
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$pidfile"
  fi
  return 1
}

port_in_use() {
  local port="$1"
  curl -s -m 1 "http://127.0.0.1:${port}/" >/dev/null 2>&1
}

wait_for_port() {
  local port="$1"
  local timeout="${2:-30}"
  local elapsed=0
  while ! port_in_use "$port" 2>/dev/null && [ "$elapsed" -lt "$timeout" ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 0  # caller checks port_in_use
}

stop_process() {
  local name="$1"
  local pidfile
  pidfile=$(pid_file "$name")
  # Kill via PID file
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    kill "$pid" 2>/dev/null || true
    rm -f "$pidfile"
  fi
  # Also kill orphaned processes via /proc scan (no lsof/fuser available).
  local hex_port=""
  case "$name" in
    mcp-gateway) hex_port=$(printf '%04X' 18080) ;;
    factory-mcp) hex_port=$(printf '%04X' 13003) ;;
    bge-mcp)     hex_port=$(printf '%04X' 13005) ;;
  esac
  if [ -n "$hex_port" ]; then
    for pid_dir in /proc/[0-9]*; do
      local pid
      pid=$(basename "$pid_dir")
      # Check if this process has the port open
      if grep -q " ${hex_port}: " "$pid_dir/net/tcp" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done
  fi
}

# --- load tokens from server.env files --------------------------------------

load_token() {
  local key="$1"
  local env_file="$2"
  if [[ -z "${!key:-}" ]] && [[ -f "$env_file" ]]; then
    while IFS='=' read -r k v; do
      k=$(echo "$k" | xargs)
      v=$(echo "$v" | xargs)
      if [[ "$k" == "$key" ]]; then
        export "$key"="$v"
        echo "  $key loaded from $env_file"
        return 0
      fi
    done < "$env_file"
  fi
  if [[ -n "${!key:-}" ]]; then
    echo "  $key already set in environment"
    return 0
  fi
  echo "  WARNING: $key not set (neither env nor $env_file)"
  return 1
}

# --- MCP components ---------------------------------------------------------

start_gateway() {
  echo "  [1/3] mcp-gateway (kubectl port-forward) ..."
  if is_running "mcp-gateway"; then
    echo "    already running (PID $(cat "$(pid_file mcp-gateway)"))"
    return 0
  fi

  nohup kubectl --context fleet port-forward -n workspace-dev svc/dev-pod \
    18080:8080 13001:3001 13002:3002 18235:18235 \
    > /tmp/mcp-gateway.log 2>&1 &
  echo $! > "$(pid_file mcp-gateway)"

  wait_for_port 18080 30
  if port_in_use 18080; then
    echo "    started (PID $(cat "$(pid_file mcp-gateway)")) — :18080 :13001 :13002 :18235"
  else
    echo "    FAILED — port-forward may not have opened :18080 (check kubectl/fleet context)"
    return 1
  fi
}

start_factory() {
  echo "  [2/3] factory-mcp-node ..."
  if is_running "factory-mcp"; then
    echo "    already running (PID $(cat "$(pid_file factory-mcp)"))"
    return 0
  fi

  if ! load_token "FACTORY_MCP_TOKEN" "$HOME/.config/factory-mcp-node/server.env"; then
    echo "    skipped (missing FACTORY_MCP_TOKEN)"
    return 1
  fi

  # Use Node.js stdlib implementation (stdlib only, no npm deps)
  nohup node "$REPO_ROOT/scripts/factory-mcp-node/server.mjs" \
    > /tmp/factory-mcp.log 2>&1 &
  echo $! > "$(pid_file factory-mcp)"

  wait_for_port 13003 10
  if port_in_use 13003; then
    echo "    started (PID $(cat "$(pid_file factory-mcp)")) — :13003"
  else
    echo "    FAILED — check /tmp/factory-mcp.log"
    return 1
  fi
}

start_bge() {
  echo "  [3/3] bge-mcp shim ..."
  if is_running "bge-mcp"; then
    echo "    already running (PID $(cat "$(pid_file bge-mcp)"))"
    return 0
  fi

  if ! load_token "BGE_MCP_TOKEN" "$HOME/.config/bge-mcp/server.env"; then
    echo "    skipped (missing BGE_MCP_TOKEN)"
    return 1
  fi

  # Wait for llm-proxy (:18235) to be reachable — it comes from the gateway
  wait_for_port 18235 30

  nohup node "$REPO_ROOT/scripts/bge-mcp/server.mjs" \
    > /tmp/bge-mcp.log 2>&1 &
  echo $! > "$(pid_file bge-mcp)"

  wait_for_port 13005 10
  if port_in_use 13005; then
    echo "    started (PID $(cat "$(pid_file bge-mcp)")) — :13005"
  else
    echo "    FAILED — check /tmp/bge-mcp.log"
    return 1
  fi
}

# --- status ----------------------------------------------------------------

status() {
  local k8s_ok="FAIL" pg_ok="FAIL" fac_ok="FAIL" bge_ok="FAIL"

  # In WSL2, port_in_use via curl is unreliable (Windows-side socket state leaks).
  # Use actual MCP initialize calls as the health check instead.

  if curl -s -m 2 -X POST http://localhost:18080/mcp \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' \
    2>/dev/null | grep -q '"result"'; then
    k8s_ok="OK"
  fi

  if curl -s -m 2 -X POST http://localhost:13001/mcp \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer ${MCP_POSTGRES_TOKEN:-}" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' \
    2>/dev/null | grep -q '"result"'; then
    pg_ok="OK"
  fi

  if curl -s -m 2 -X POST http://localhost:13003/mcp \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${FACTORY_MCP_TOKEN:-}" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' \
    2>/dev/null | grep -q '"result"'; then
    fac_ok="OK"
  fi

  if curl -s -m 2 -X POST http://localhost:13005/mcp \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${BGE_MCP_TOKEN:-}" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' \
    2>/dev/null | grep -q '"result"'; then
    bge_ok="OK"
  fi

  echo "MCP status:"
  echo "  mcp-kubernetes     (:18080) → $k8s_ok"
  echo "  mcp-postgres       (:13001) → $pg_ok"
  echo "  factory-mcp-node   (:13003) → $fac_ok"
  echo "  bge-mcp            (:13005) → $bge_ok"

  if [ "$k8s_ok" = "OK" ] && [ "$pg_ok" = "OK" ] && [ "$fac_ok" = "OK" ] && [ "$bge_ok" = "OK" ]; then
    return 0
  fi
  return 1
}

# --- main -------------------------------------------------------------------

case "${1:-start}" in
  start)
    echo "=== Starting MCP infrastructure ==="
    errors=0
    start_gateway || errors=$((errors + 1))
    start_factory || errors=$((errors + 1))
    start_bge || errors=$((errors + 1))
    if [ "$errors" -gt 0 ]; then
      echo "=== $errors server(s) failed to start ==="
      exit 1
    fi
    echo "=== All MCP servers started ==="
    ;;
  stop)
    echo "=== Stopping MCP infrastructure ==="
    for name in mcp-gateway factory-mcp bge-mcp; do
      stop_process "$name" 2>/dev/null || echo "$name was not running"
    done
    echo "=== MCP infrastructure stopped ==="
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
