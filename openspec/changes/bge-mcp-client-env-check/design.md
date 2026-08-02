# Design: bge-mcp Client-Env-Check

## Komponenten

### 1. `scripts/bge-mcp/check-client-env.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HOME}/.config/bge-mcp/server.env"
BGE_URL="http://127.0.0.1:13005"

# Prüfe server.env Existenz + Token
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: $ENV_FILE nicht gefunden"
  echo "FIX: lege ~/.config/bge-mcp/server.env an mit BGE_MCP_TOKEN=<token>"
  exit 1
fi

TOKEN=$(bash -c "set -a; source '$ENV_FILE'; set +a; echo \${BGE_MCP_TOKEN:-}" 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  echo "FAIL: BGE_MCP_TOKEN nicht in $ENV_FILE gesetzt"
  echo "FIX: stelle sicher dass $ENV_FILE 'BGE_MCP_TOKEN=<token>' enthält"
  exit 1
fi

# Probiere Server
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BGE_URL" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "000" ]]; then
  echo "FAIL: bge-mcp Server ($BGE_URL) nicht erreichbar (Connection refused)"
  exit 2
elif [[ "$HTTP_CODE" == "401" ]]; then
  echo "FAIL: bge-mcp Server antwortet 401 — Token ungültig"
  exit 2
elif [[ "$HTTP_CODE" == "200" ]]; then
  echo "OK: bge-mcp Server erreichbar, Token gültig"
  exit 0
else
  echo "WARN: unerwarteter HTTP-Status $HTTP_CODE"
  exit 2
fi
```

### 2. BATS-Test (`tests/spec/mcp-gateway/client-env-check.bats`)

- **Setup:** tmpdir mit Fake `server.env` (Token=test123)
- **Test 1:** gültiges Env + Mock-Server auf ephemerem Port → exit 0
- **Test 2:** kein Env-File → exit 1 + Fix-Hinweis im Output
- **Test 3:** Server down (kein Listener) → exit 2
- CI-sicher: kein Zugriff auf echte `~/.config/bge-mcp/server.env`

### 3. Doku-Update (`mcp-tool-guide.md`)

Zeilen ~248-256: Diagnose-Block um Verweis auf `scripts/bge-mcp/check-client-env.sh` ergänzen.

## Abgrenzung

- Kein Klartext-Token in getrackten Dateien
- Keine Änderung an `server.mjs`
