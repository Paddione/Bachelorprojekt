#!/usr/bin/env bash
# scripts/mcp-gateway/doctor.sh — MCP-Auth-Gesundheitscheck fuer alle Harnesses.
#
# T0141xx: Nach jedem opencode-Neustart verloren bge-mcp, ticket-mcp und
# mcp-postgres die Auth ("failed" in der MCP-Liste). Ursachen waren verteilt:
#   1. opencode laedt nur `plugins/` (Plural) automatisch — die Token-Plugins
#      lagen im singulaeren `plugin/` und liefen nie (jetzt: Import-Time-Lader
#      + Sync nach `~/.config/opencode/plugins/`).
#   2. bge-mcp.service war gestoppt (Port zu) — Units muessen laufen.
#   3. Claude Code (.mcp.json) ist bewusst header-frei (T004272) — Auth dafuer
#      liegt in ~/.claude/settings.json (User-Scope, aufgeloest).
#
# Dieser Check prueft Server-Seite (Units, Ports, Bearer-Auth erzwungen +
# gueltig) und Client-Seite (opencode-Plugins, aufgeloeste Harness-Configs,
# ticket-stdio) — ohne je einen Token-Wert auszugeben.
#
# Aufruf: bash scripts/mcp-gateway/doctor.sh
# Exit 0 = alles OK; Exit 1 = mindestens ein FAIL (Fix-Hinweis steht dabei).

set -uo pipefail

FAIL=0
ok()   { echo "OK:   $1"; }
fail() { echo "FAIL: $1"; echo "      Fix: $2"; FAIL=1; }
warn() { echo "WARN: $1 ($2)"; }

load_key() { # load_key <file> <key> -> prints value or empty
  local f="$1" k="$2" line key val
  [ -r "$f" ] || return 0
  while IFS= read -r line; do
    key="${line%%=*}"; val="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    if [ "$key" = "$k" ] && [ -n "$val" ]; then printf '%s' "$val"; return 0; fi
  done < "$f"
}

echo "=== mcp:doctor — Server-Seite (Units) ==="
if command -v systemctl >/dev/null 2>&1; then
  for u in bge-mcp mcp-postgres-local factory-mcp mcp-gateway; do
    if systemctl --user is-active --quiet "$u" 2>/dev/null; then
      ok "unit $u aktiv"
    else
      fail "unit $u nicht aktiv" "systemctl --user start $u  (Dauerhaft: is-enabled pruefen)"
    fi
  done
else
  warn "systemctl fehlt" "Units uebersprungen (kein systemd)"
fi

echo "=== mcp:doctor — Server-Seite (Bearer-Probes) ==="
probe() { # probe <port> <envfile> <key> <label> <protocolVersion>
  local port="$1" file="$2" key="$3" label="$4" pv="$5"
  local tok body code noauth
  tok="$(load_key "$file" "$key")"
  if [ -z "$tok" ]; then
    fail "$label: $key fehlt in $file" "Token in $file ergaenzen (Format: KEY=wert)"
    return
  fi
  body='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"'"$pv"'","capabilities":{},"clientInfo":{"name":"mcp-doctor","version":"1"}}}'
  code="$(curl -s -o /tmp/mcp-doctor-"$port".json -w '%{http_code}' --max-time 5 \
    -X POST "http://127.0.0.1:$port/mcp" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -H "Authorization: Bearer ${tok}" -d "$body" 2>/dev/null)"
  if [ "$code" = "200" ] && grep -q '"protocolVersion"' /tmp/mcp-doctor-"$port".json 2>/dev/null; then
    ok "$label :$port antwortet mit gueltigem Token (HTTP 200)"
  else
    fail "$label :$port antwortet nicht (HTTP ${code:-000})" "Unit-Log pruefen: journalctl --user -u <unit> -n 30"
  fi
  noauth="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    -X POST "http://127.0.0.1:$port/mcp" \
    -H 'Content-Type: application/json' -d "$body" 2>/dev/null)"
  if [ "$noauth" = "401" ]; then
    ok "$label :$port erzwingt Auth (ohne Token HTTP 401)"
  else
    warn "$label :$port ohne Token: HTTP ${noauth:-000} statt 401" "Guard pruefen (mcp-http-security.mjs)"
  fi
  unset tok
}
probe 13005 "$HOME/.config/bge-mcp/server.env" BGE_MCP_TOKEN bge-mcp 2025-06-18
probe 13001 "$HOME/.config/mcp-postgres/server.env" MCP_POSTGRES_TOKEN mcp-postgres 2024-11-05
probe 13003 "$HOME/.config/factory-mcp-node/server.env" FACTORY_MCP_TOKEN factory-mcp-node 2024-11-05

echo "=== mcp:doctor — Client-Seite (opencode) ==="
if [ -f "$HOME/.config/opencode/plugins/bge-mcp-env.ts" ] && \
   [ -f "$HOME/.config/opencode/plugins/mcp-client-tokens-env.ts" ]; then
  ok "Token-Plugins in ~/.config/opencode/plugins/ (Auto-Load-Verzeichnis)"
else
  fail "Token-Plugins fehlen in ~/.config/opencode/plugins/" "bash scripts/opencode-sync-agents.sh (verteilt .opencode/plugin/*.ts)"
fi
if grep -q '{env:BGE_MCP_TOKEN}' .opencode/opencode.jsonc 2>/dev/null && \
   grep -q '{env:MCP_POSTGRES_TOKEN}' .opencode/opencode.jsonc 2>/dev/null && \
   grep -q '{env:FACTORY_MCP_TOKEN}' .opencode/opencode.jsonc 2>/dev/null; then
  ok ".opencode/opencode.jsonc referenziert alle 3 {env:...}-Token"
else
  fail ".opencode/opencode.jsonc ohne {env:...}-Header" "task mcp:sync (Registry-SSOT)"
fi

echo "=== mcp:doctor — Client-Seite (Datei-Harnesses, aufgeloeste Token) ==="
node -e "
  const fs = require('fs'), os = require('os'), path = require('path');
  const home = os.homedir();
  const targets = [
    { file: path.join(home, '.claude', 'settings.json'), servers: ['bge-mcp', 'mcp-postgres', 'factory-mcp-node'], kind: 'claude-user' },
    { file: path.join(home, '.gemini', 'config', 'mcp_config.json'), servers: ['bge-mcp', 'mcp-postgres', 'factory-mcp-node'], kind: 'agy' },
    { file: path.join(home, '.qwen', 'settings.json'), servers: ['bge-mcp', 'mcp-postgres', 'factory-mcp-node'], kind: 'qwen' },
  ];
  let bad = 0;
  for (const t of targets) {
    let d = {};
    try { d = JSON.parse(fs.readFileSync(t.file, 'utf8')); } catch { console.log('FAIL: ' + t.kind + ' ' + t.file + ' fehlt/ungueltig'); bad = 1; continue; }
    const servers = d.mcpServers || {};
    for (const s of t.servers) {
      const h = servers[s] && servers[s].headers && servers[s].headers.Authorization;
      if (typeof h === 'string' && h.indexOf('Bearer ') === 0 && h.length > 20 && h.indexOf('\${') < 0) {
        console.log('OK:   ' + t.kind + ' ' + s + ' mit aufgeloestem Bearer-Token');
      } else {
        console.log('FAIL: ' + t.kind + ' ' + s + ' ohne gueltigen Bearer-Token');
        bad = 1;
      }
    }
  }
  process.exit(bad);
" || { echo "      Fix: task mcp:sync (loest Token aus ~/.config/*/server.env auf)"; FAIL=1; }

echo "=== mcp:doctor — ticket-mcp (stdio) ==="
if [ -f scripts/ticket-mcp-node/server.mjs ]; then
  if echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcp-doctor","version":"1"}}}' \
    | timeout 20 node scripts/ticket-mcp-node/server.mjs 2>/dev/null | grep -q '"name":"ticket-mcp"'; then
    ok "ticket-mcp-node stdio antwortet (Repo-Root: $(pwd))"
  else
    fail "ticket-mcp-node stdio antwortet nicht" "ticket.sh-Backend pruefen: bash scripts/ticket.sh list --brand mentolder --limit 1"
  fi
else
  warn "nicht im Repo-Root" "doctor aus /home/patrick/Bachelorprojekt starten"
fi

echo "=== mcp:doctor: $([ "$FAIL" -eq 0 ] && echo ALLE CHECKS OK || echo FEHLER GEFUNDEN) ==="
exit "$FAIL"
