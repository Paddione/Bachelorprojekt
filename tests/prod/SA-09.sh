#!/usr/bin/env bash
# SA-09: Billing-Infrastruktur (Prod) — Erreichbarkeit und SSO
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

BILLING_URL="${PROTO:-https}://billing-${PROD_DOMAIN}"
NAMESPACE="${NAMESPACE:-workspace}"

# T1: billing-Domain erreichbar (OAuth2-Proxy antwortet)
BILLING_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${BILLING_URL}/" 2>/dev/null)
BILLING_OK="false"
[[ "$BILLING_STATUS" == "302" || "$BILLING_STATUS" == "200" || "$BILLING_STATUS" == "403" ]] && BILLING_OK="true"
assert_eq "$BILLING_OK" "true" "SA-09" "T1" "billing-Domain erreichbar (HTTP ${BILLING_STATUS})"

# T2: OAuth2-Proxy leitet zu Keycloak weiter
BILLING_REDIRECT=$(curl -sk -o /dev/null -D - --max-time 10 "${BILLING_URL}/" 2>/dev/null \
  | grep -i '^location:' | tr -d '\r')
assert_contains "$BILLING_REDIRECT" "auth-${PROD_DOMAIN}" "SA-09" "T2" \
  "Billing-SSO leitet zu Keycloak weiter"

# T3: OAuth2-Proxy Callback-URL korrekt konfiguriert
assert_contains "$BILLING_REDIRECT" "billing-${PROD_DOMAIN}" "SA-09" "T3" \
  "OAuth2-Proxy Callback enthält billing-Domain"

# T4: Statische Assets ohne Auth erreichbar (skip-auth-regex)
FAVICON_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${BILLING_URL}/favicon.ico" 2>/dev/null)
# 200 or 404 (both OK — means no redirect to login)
STATIC_OK="false"
[[ "$FAVICON_STATUS" == "200" || "$FAVICON_STATUS" == "404" ]] && STATIC_OK="true"
assert_eq "$STATIC_OK" "true" "SA-09" "T4" "Statische Assets ohne Auth erreichbar (HTTP ${FAVICON_STATUS})"

# T5: manifest.json ohne Auth erreichbar (CORS-Fix)
MANIFEST_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${BILLING_URL}/manifest.json" 2>/dev/null)
MANIFEST_OK="false"
[[ "$MANIFEST_STATUS" == "200" || "$MANIFEST_STATUS" == "404" ]] && MANIFEST_OK="true"
assert_eq "$MANIFEST_OK" "true" "SA-09" "T5" "manifest.json ohne Auth (CORS-Fix, HTTP ${MANIFEST_STATUS})"

# T6: Billing-Bot Pod running
BOT_READY=$(kubectl get pods -n "$NAMESPACE" -l app=billing-bot --no-headers 2>/dev/null \
  | awk '{print $2}' | head -1)
assert_eq "$BOT_READY" "1/1" "SA-09" "T6" "Billing-Bot Pod running (Prod)"

# T7: Invoice Ninja Pod running
IN_READY=$(kubectl get pods -n "$NAMESPACE" -l app=invoiceninja --no-headers 2>/dev/null \
  | awk '{print $2}' | head -1)
assert_eq "$IN_READY" "2/2" "SA-09" "T7" "Invoice Ninja Pod running (Prod)"

# T8: TLS-Zertifikat gültig
TLS_VALID=$(curl -sv "https://billing-${PROD_DOMAIN}/" 2>&1 | grep -c 'SSL certificate verify ok' || echo "0")
assert_gt "$TLS_VALID" "0" "SA-09" "T8" "TLS-Zertifikat für billing-Domain gültig"
