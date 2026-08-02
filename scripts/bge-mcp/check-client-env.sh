#!/usr/bin/env bash
# scripts/bge-mcp/check-client-env.sh
# Ticket: T002504
# SSOT: openspec/changes/bge-mcp-client-env-check/proposal.md
#
# Diagnostiziert die Betriebsvoraussetzung fuer bge-mcp (Shim auf :13005):
# BGE_MCP_TOKEN muss VOR dem Harness-Start in der Umgebung exportiert sein.
# Fehlt der Export, expandiert opencode den Platzhalter "{env:BGE_MCP_TOKEN}"
# zu leer -> "Authorization: Bearer " -> HTTP 401 -> Server erscheint in
# `opencode mcp list` als "failed". Diese Fehldiagnose ("Server inaktiv")
# ist von "Token fehlt im Client-Env" ohne diesen Check nicht unterscheidbar.
#
# Der TOKEN-WERT wird an keiner Stelle ausgegeben — nur ob er gesetzt ist.
#
# Exit codes:
#   0 - ok: server.env lesbar, BGE_MCP_TOKEN gesetzt, Server antwortet 200
#   1 - Token fehlt (server.env fehlt/unlesbar ODER BGE_MCP_TOKEN nicht gesetzt)
#   2 - Server nicht erreichbar (connection refused / kein HTTP-Response)
set -uo pipefail

# Overridable fuer Tests (Fake-Env im tmpdir) — Default ist die echte Betriebsvoraussetzung.
ENV_FILE="${BGE_MCP_CLIENT_ENV_FILE:-$HOME/.config/bge-mcp/server.env}"
HOST="${BGE_MCP_HOST:-127.0.0.1}"
PORT="${BGE_MCP_PORT:-13005}"
ENDPOINT="http://${HOST}:${PORT}/mcp"

fix_hint() {
  cat <<EOF
Fix: BGE_MCP_TOKEN vor dem Harness-Start exportieren, z.B. in ~/.bashrc:
  set -a; . ~/.config/bge-mcp/server.env; set +a
Siehe .claude/skills/references/mcp-tool-guide.md (Diagnose-Block bge-mcp).
EOF
}

echo "bge-mcp Client-Env-Check"
echo "  env file : $ENV_FILE"
echo "  endpoint : $ENDPOINT"

if [ ! -f "$ENV_FILE" ] || [ ! -r "$ENV_FILE" ]; then
  echo "FAIL: $ENV_FILE existiert nicht oder ist nicht lesbar."
  fix_hint
  exit 1
fi

# In einer Subshell sourcen — der Token darf niemals in dieses Skript ausgeleckt
# werden (kein Echo des Werts), nur die Existenz wird geprueft.
TOKEN_SET="$(
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE" 2>/dev/null
  set +a
  if [ -n "${BGE_MCP_TOKEN:-}" ]; then
    echo "yes"
  else
    echo "no"
  fi
)"

if [ "$TOKEN_SET" != "yes" ]; then
  echo "FAIL: BGE_MCP_TOKEN ist in $ENV_FILE nicht gesetzt (oder leer)."
  fix_hint
  exit 1
fi

echo "OK: BGE_MCP_TOKEN ist in $ENV_FILE gesetzt (Wert wird nicht ausgegeben)."

# Server-Probe ohne Token: unterscheidet "laeuft, aber 401" von "laeuft nicht".
probe_body='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check-client-env","version":"1"}}}'

no_auth_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d "$probe_body" 2>/dev/null)"
curl_exit=$?

if [ "$curl_exit" -ne 0 ] || [ -z "$no_auth_status" ]; then
  echo "FAIL: Server unter $ENDPOINT nicht erreichbar (curl exit=$curl_exit)."
  echo "Fix: bge-mcp Server/Shim starten (siehe scripts/bge-mcp/server.mjs, bge-mcp.service)."
  exit 2
fi

echo "  Probe ohne Token -> HTTP $no_auth_status (401 erwartet, bestaetigt: Server laeuft, Bearer-Pflicht aktiv)"

# Probe MIT Token — bestaetigt End-to-End, dass Token + Server zusammenpassen.
TOKEN_VALUE="$(
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE" 2>/dev/null
  set +a
  printf '%s' "${BGE_MCP_TOKEN:-}"
)"

with_auth_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer ${TOKEN_VALUE}" \
  -d "$probe_body" 2>/dev/null)"
curl_exit=$?
unset TOKEN_VALUE

if [ "$curl_exit" -ne 0 ] || [ -z "$with_auth_status" ]; then
  echo "FAIL: Server unter $ENDPOINT wurde beim zweiten Probe nicht erreicht (curl exit=$curl_exit)."
  exit 2
fi

if [ "$with_auth_status" = "200" ]; then
  echo "  Probe mit Token   -> HTTP $with_auth_status"
  echo "OK: bge-mcp Client-Env vollstaendig — Token gesetzt, Server erreichbar, Auth erfolgreich."
  exit 0
fi

echo "FAIL: Probe mit Token lieferte HTTP $with_auth_status (200 erwartet)."
echo "Fix: BGE_MCP_TOKEN in $ENV_FILE stimmt vermutlich nicht mit dem Server-Token ueberein."
exit 1
