#!/usr/bin/env bash
# probe.sh — MCP Tunnel-Liveness Check für die Gateway-, devmesh- und Postgres-Kette
#
# T002543: Der kubectl port-forward hat einen Versagensmodus, in dem der Prozess
# weiterlebt, waehrend die SPDY-Streams abgerissen sind. Ein TCP-Connect allein
# reicht nicht — der Probe fuehrt deshalb einen echten MCP-initialize per HTTP-POST.
#
# T006996: POST-Zielpfad korrigiert (/mcp statt /) + Accept-Header. Der Probe
# war seit Einfuehrung blind: die MCP-Endpoints liegen unter /mcp, der
# Root-Pfad antwortet 404 — der protocolVersion-grep schlug deshalb bei jedem
# gesunden Tunnel fehl ("not an MCP initialize response" auf allen Ports).
#
# Aufruf: probe.sh [--port N]... [--timeout SEK] [--help]
# Ohne --port werden die verdrahteten Ports geprueft (18080, 13005, 13001, 18235).
# Exit 0 = alle geprueften Ports antworten (gueltiges MCP-initialize bzw.
# HTTP-Health auf 18235).
# Exit 1 = mindestens ein Port ist tot oder antwortet nicht.

set -euo pipefail

# T002767/T006996/T900191: nur die verdrahteten Endpoints pruefen. 18080 = fleet-forward
# (mcp-kubernetes, mcp-gateway.service), 13005 = bge-mcp im devmesh-Pod llm-services
# (devmesh-forward.service), 18235 = llm-proxy im devmesh-Pod llm-services
# (derselbe devmesh-forward.service), 13001 = lokaler mcp-postgres-local.service (fleet-DB,
# KEIN Forward mehr — :13001 aus dem devmesh-Forward ist entfallen).
PORTS=(18080 13005 13001 18235)
TIMEOUT=5
SHOW_HELP=false

usage() {
  cat <<EOF
Usage: probe.sh [--port N]... [--timeout SEK] [--help]

  --port N      Prüfe Port N (wiederholbar; der erste --port ersetzt die
                Defaults)
  --timeout SEK Timeout pro Port in Sekunden (default: ${TIMEOUT})
  --help        Diese Hilfe

Exit-Codes:
  0  Alle geprüften Ports antworten mit gültigem MCP-initialize.
  1  Mindestens ein Port ist tot oder die Antwort ist kein MCP-initialize.
EOF
}

FIRST_PORT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --port)
      if [ "$FIRST_PORT" -eq 1 ]; then PORTS=(); FIRST_PORT=0; fi
      PORTS+=("$2"); shift 2 ;;
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
  # T901560: :18235 ist kein MCP-Server (llm-proxy) — HTTP-Health statt
  # MCP-initialize: POST /v1/embeddings mit Minimal-Payload. 200 oder 4xx
  # (Modell/Validierung — Prozess routenfaehig) zaehlt als OK, Timeout/5xx
  # zaehlt als FAIL.
  if [ "$PORT" -eq 18235 ]; then
    HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT}" \
      -X POST "http://127.0.0.1:18235/v1/embeddings" \
      -H "Content-Type: application/json" \
      -d '{"model":"bge-m3","input":["ok"]}' 2>&1) || HTTP_CODE="000"
    if [ "$HTTP_CODE" = "200" ] || [[ "$HTTP_CODE" == 4* ]]; then
      echo "OK port 18235"
    else
      echo "FAIL port 18235: HTTP ${HTTP_CODE}" >&2
      FAILED=1
    fi
    continue
  fi
  # MCP-initialize: JSON-RPC 2.0 POST mit initialize-Methode an den /mcp-Endpoint.
  # Der MCP-Server muss mit einem gültigen initialize result antworten,
  # das protocolVersion enthält — kein TCP-Connect, kein /health.
  AUTH_HEADER=()
  if [ "$PORT" -eq 13001 ]; then
    if [ -z "${MCP_POSTGRES_TOKEN:-}" ] && [ -f "$HOME/.config/mcp-postgres/server.env" ]; then
      # shellcheck disable=SC1090
      source "$HOME/.config/mcp-postgres/server.env" 2>/dev/null || true
    fi
    if [ -n "${MCP_POSTGRES_TOKEN:-}" ]; then
      AUTH_HEADER=(-H "Authorization: Bearer ${MCP_POSTGRES_TOKEN}")
    fi
  fi
  if [ "$PORT" -eq 13005 ]; then
    if [ -z "${BGE_MCP_TOKEN:-}" ] && [ -f "$HOME/.config/bge-mcp/server.env" ]; then
      # shellcheck disable=SC1090
      source "$HOME/.config/bge-mcp/server.env" 2>/dev/null || true
    fi
    if [ -n "${BGE_MCP_TOKEN:-}" ]; then
      AUTH_HEADER=(-H "Authorization: Bearer ${BGE_MCP_TOKEN}")
    fi
  fi

  RESPONSE=$(curl -sS --max-time "${TIMEOUT}" \
    -X POST "http://127.0.0.1:${PORT}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    "${AUTH_HEADER[@]}" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe.sh","version":"1.0"}}}' 2>&1) || true

  if [ -z "${RESPONSE}" ]; then
    echo "FAIL port ${PORT}: no response" >&2
    FAILED=1
    continue
  fi

  # Prüfe auf JSON-RPC success response mit result.protocolVersion.
  # SSE-gerahmte Antworten (event:/data:) enthalten das Feld in der data-Zeile —
  # der grep greift auch dort.
  if echo "${RESPONSE}" | grep -q '"protocolVersion"' 2>/dev/null; then
    echo "OK port ${PORT}"
  else
    echo "FAIL port ${PORT}: not an MCP initialize response" >&2
    FAILED=1
  fi
done

exit "${FAILED}"
