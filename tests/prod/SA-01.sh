#!/usr/bin/env bash
# SA-01: Transportverschlüsselung — TLS ciphers, HSTS, redirect, cert
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: HTTP → HTTPS redirect
assert_http_redirect "http://${MM_DOMAIN}" "https://${MM_DOMAIN}" "SA-01" "T1" "HTTP → HTTPS Redirect"

# T2: TLS 1.3 supported
if command -v nmap &>/dev/null; then
  TLS_OUTPUT=$(nmap --script ssl-enum-ciphers -p 443 "${MM_DOMAIN}" 2>/dev/null)
  assert_contains "$TLS_OUTPUT" "TLSv1.3" "SA-01" "T2" "TLS 1.3 unterstützt"
else
  TLS_VER=$(curl -sI -v "https://${MM_DOMAIN}" 2>&1 | grep -o "TLSv1\.[23]" | head -1)
  assert_match "$TLS_VER" "TLSv1\.[23]" "SA-01" "T2" "TLS 1.2+ aktiv"
fi

# T3: Valid certificate
CERT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "https://${MM_DOMAIN}/api/v4/system/ping")
assert_eq "$CERT_STATUS" "200" "SA-01" "T3" "Gültiges TLS-Zertifikat (kein curl-Fehler)"

# T4: WebSocket endpoint reachable
WS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  "https://${MM_DOMAIN}/api/v4/websocket")
assert_contains "101 200 400" "$WS_STATUS" "SA-01" "T4" "WebSocket-Endpunkt erreichbar"

# T5: HSTS header
HSTS=$(curl -sI "https://${MM_DOMAIN}" | grep -i 'strict-transport-security' || echo "")
assert_gt "${#HSTS}" 0 "SA-01" "T5" "HSTS-Header gesetzt"
