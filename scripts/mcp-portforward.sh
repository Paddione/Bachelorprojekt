#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-start}"
PIDFILE="/tmp/mcp-portforward.pids"

if [ "$ACTION" = "start" ]; then
  echo "Starting MCP port-forwards..."
  nohup kubectl port-forward -n default svc/claude-code-mcp-monolith \
    18080:8080 18081:8081 13000:3000 13001:3001 13002:3002 \
    > /tmp/mcp-portforward.log 2>&1 &
  echo $! > "$PIDFILE"
  sleep 2
  echo "MCP port-forwards started (PID $(cat "$PIDFILE"))"
  echo "  k8s:      http://localhost:18080/mcp"
  echo "  keycloak: http://localhost:18081/mcp/sse"
  echo "  browser:  http://localhost:13000/mcp"
  echo "  postgres: http://localhost:13001/mcp"
  echo "  github:   http://localhost:13002/mcp"

elif [ "$ACTION" = "stop" ]; then
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "MCP port-forwards stopped"
  else
    pkill -f "port-forward.*claude-code-mcp-monolith" 2>/dev/null || echo "No MCP port-forwards running"
  fi

elif [ "$ACTION" = "status" ]; then
  PF_PIDS=$(pgrep -f "port-forward.*claude-code-mcp-monolith" 2>/dev/null || true)
  if [ -n "$PF_PIDS" ]; then
    echo "MCP port-forwards running (PIDs: $PF_PIDS)"
    for port in 18080 18081 13000 13001 13002; do
      if ss -tlnp "sport = :$port" 2>/dev/null | grep -q LISTEN; then
        echo "  :$port — OK"
      else
        echo "  :$port — DOWN"
      fi
    done
  else
    echo "MCP port-forwards NOT running"
    echo "  Start with: $0 start"
  fi

else
  echo "Usage: $0 {start|stop|status}"
  exit 1
fi
