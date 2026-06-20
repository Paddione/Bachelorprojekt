#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-start}"
PIDFILE_MONOLITH="/tmp/mcp-portforward-monolith.pid"

start_monolith() {
  if [ -f "$PIDFILE_MONOLITH" ] && kill -0 "$(cat "$PIDFILE_MONOLITH")" 2>/dev/null; then
    echo "Monolith port-forward already running (PID $(cat "$PIDFILE_MONOLITH"))"
    return
  fi
  nohup kubectl --context k3d-korczewski-dev port-forward \
    -n workspace-korczewski-dev svc/claude-code-mcp-monolith \
    18080:8080 13000:3000 13001:3001 13002:3002 \
    >> /tmp/mcp-portforward.log 2>&1 &
  echo $! > "$PIDFILE_MONOLITH"
  echo "  Monolith started (PID $(cat "$PIDFILE_MONOLITH"))"
}

if [ "$ACTION" = "start" ]; then
  echo "Starting MCP port-forwards..."
  start_monolith
  sleep 2
  echo "MCP port-forwards ready:"
  echo "  k8s:      http://localhost:18080/mcp  (also /sse)"
  echo "  browser:  http://localhost:13000/mcp"
  echo "  postgres: http://localhost:13001/mcp"
  echo "  github:   http://localhost:13002/mcp"

elif [ "$ACTION" = "stop" ]; then
  for pidfile in "$PIDFILE_MONOLITH"; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      kill "$pid" 2>/dev/null && echo "Stopped PID $pid" || true
      rm -f "$pidfile"
    fi
  done
  pkill -f "port-forward.*claude-code-mcp-monolith" 2>/dev/null || true
  echo "MCP port-forwards stopped"

elif [ "$ACTION" = "status" ]; then
  echo "=== MCP Port-Forward Status ==="
  for port in 18080 13000 13001 13002; do
    if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
      echo "  :$port -- LISTENING"
    else
      echo "  :$port -- DOWN"
    fi
  done
  echo ""
  echo "=== Endpoint Health ==="
  for name_port_path in "k8s:18080:/mcp" "browser:13000:/mcp" "postgres:13001:/mcp" "github:13002:/mcp"; do
    name="${name_port_path%%:*}"
    rest="${name_port_path#*:}"
    port="${rest%%:*}"
    path="${rest#*:}"
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 \
      -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1.0"}}}' \
      "http://localhost:${port}${path}" 2>/dev/null || echo "ERR")
    [ "$code" = "200" ] && status="OK" || status="FAIL (HTTP $code)"
    echo "  ${name} (localhost:${port}): ${status}"
  done

else
  echo "Usage: $0 {start|stop|status}"
  exit 1
fi
