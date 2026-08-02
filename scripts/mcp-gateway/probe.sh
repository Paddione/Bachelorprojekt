#!/usr/bin/env bash
# probe.sh — MCP Tunnel-Liveness Check für mcp-gateway.service
#
# T002543: Der kubectl port-forward hat einen Versagensmodus, in dem der Prozess
# weiterlebt, waehrend die SPDY-Streams abgerissen sind. Ein TCP-Connect allein
# reicht nicht — der Probe fuehrt deshalb einen echten MCP-initialize per HTTP-POST.
#
# Aufruf: probe.sh [--port N] [--timeout SEK] [--help]
# Ohne --port werden alle vier Ports geprueft (18080, 13000, 13001, 13002).
# Exit 0 = alle geprueften Ports antworten mit gültigem MCP-initialize.
# Exit 1 = mindestens ein Port ist tot oder antwortet nicht mit MCP.

set -euo pipefail

PORTS=(18080 13000 13001 13002)
TIMEOUT=5
SHOW_HELP=false

usage() {
  cat <<EOF
Usage: probe.sh [--port N] [--timeout SEK] [--help]

  --port N      Prüfe nur Port N (statt aller vier: ${PORTS[*]})
  --timeout SEK Timeout pro Port in Sekunden (default: ${TIMEOUT})
  --help        Diese Hilfe

Exit-Codes:
  0  Alle geprüften Ports antworten mit gültigem MCP-initialize.
  1  Mindestens ein Port ist tot oder die Antwort ist kein MCP-initialize.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORTS=("$2"); shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --help) SHOW_HELP=true; shift ;;
    *) echo "Unbekannte Option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if $SHOW_HELP; then
  usage
  exit 0
fi

FAILED=0
for PORT in "${PORTS[@]}"; do
  # MCP-initialize: JSON-RPC 2.0 POST mit initialize-Methode.
  # Der MCP-Server muss mit einem gültigen initialize result antworten,
  # das protocolVersion enthält — kein TCP-Connect, kein /health.
  RESPONSE=$(curl -sS --max-time "${TIMEOUT}" \
    -X POST "http://127.0.0.1:${PORT}" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe.sh","version":"1.0"}}}' 2>&1) || true

  if [ -z "${RESPONSE}" ]; then
    echo "FAIL port ${PORT}: no response" >&2
    FAILED=1
    continue
  fi

  # Prüfe auf JSON-RPC success response mit result.protocolVersion
  if echo "${RESPONSE}" | grep -q '"protocolVersion"' 2>/dev/null; then
    echo "OK port ${PORT}"
  else
    echo "FAIL port ${PORT}: not an MCP initialize response" >&2
    FAILED=1
  fi
done

exit "${FAILED}"
