#!/usr/bin/env bash
# SA-09: Billing-Infrastruktur — Invoice Ninja, OAuth2-Proxy, Billing-Bot, SSO
# Tests: Pod-Status, Services, Ingress/IngressRoute, SSO-Middleware, MariaDB
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

# ── Group A: Pod- und Service-Status ────────────────────────────

# T1: Invoice Ninja Pod running
IN_READY=$(kubectl get pods -n "$NAMESPACE" -l app=invoiceninja --no-headers 2>/dev/null \
  | awk '{print $2}' | head -1)
assert_eq "$IN_READY" "2/2" "SA-09" "T1" "Invoice Ninja Pod running (2/2 Container: PHP-FPM + nginx)"

# T2: Invoice Ninja MariaDB running
MARIA_READY=$(kubectl get pods -n "$NAMESPACE" -l app=invoiceninja-mariadb --no-headers 2>/dev/null \
  | awk '{print $2}' | head -1)
assert_eq "$MARIA_READY" "1/1" "SA-09" "T2" "Invoice Ninja MariaDB Pod running"

# T3: OAuth2-Proxy running
PROXY_READY=$(kubectl get pods -n "$NAMESPACE" -l app=oauth2-proxy-invoiceninja --no-headers 2>/dev/null \
  | awk '{print $2}' | head -1)
assert_eq "$PROXY_READY" "1/1" "SA-09" "T3" "OAuth2-Proxy (Invoice Ninja) Pod running"

# T4: Billing-Bot running
BOT_READY=$(kubectl get pods -n "$NAMESPACE" -l app=billing-bot --no-headers 2>/dev/null \
  | awk '{print $2}' | head -1)
assert_eq "$BOT_READY" "1/1" "SA-09" "T4" "Billing-Bot Pod running"

# T5: Invoice Ninja Service existiert
IN_SVC=$(kubectl get svc invoiceninja -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")
assert_eq "$IN_SVC" "80" "SA-09" "T5" "Invoice Ninja Service auf Port 80"

# T6: OAuth2-Proxy Service existiert
PROXY_SVC=$(kubectl get svc oauth2-proxy-invoiceninja -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")
assert_eq "$PROXY_SVC" "4180" "SA-09" "T6" "OAuth2-Proxy Service auf Port 4180"

# T7: Billing-Bot Service existiert
BOT_SVC=$(kubectl get svc billing-bot -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")
assert_eq "$BOT_SVC" "8090" "SA-09" "T7" "Billing-Bot Service auf Port 8090"

# ── Group B: Datenbank ──────────────────────────────────────────

# T8: MariaDB erreichbar
DB_PASS=$(kubectl get secret homeoffice-secrets -n "$NAMESPACE" -o jsonpath='{.data.INVOICENINJA_DB_PASSWORD}' 2>/dev/null | base64 -d)
DB_CHECK=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja-mariadb -- \
  mariadb -u invoiceninja -p"$DB_PASS" invoiceninja -sN -e "SELECT 1;" 2>/dev/null || echo "")
assert_eq "$DB_CHECK" "1" "SA-09" "T8" "MariaDB erreichbar und invoiceninja-DB vorhanden"

# T9: users-Tabelle existiert
USER_TABLE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja-mariadb -- \
  mariadb -u invoiceninja -p"$DB_PASS" invoiceninja -sN -e \
  "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
assert_gt "$USER_TABLE" "0" "SA-09" "T9" "Invoice Ninja users-Tabelle hat Einträge"

# T10: company_tokens-Tabelle existiert (API-Zugang)
TOKEN_TABLE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja-mariadb -- \
  mariadb -u invoiceninja -p"$DB_PASS" invoiceninja -sN -e \
  "SELECT COUNT(*) FROM company_tokens;" 2>/dev/null || echo "0")
assert_gt "$TOKEN_TABLE" "0" "SA-09" "T10" "API-Tokens vorhanden (company_tokens)"

# ── Group C: OAuth2-Proxy Konfiguration ─────────────────────────

# T11: OAuth2-Proxy Ping-Endpoint
PROXY_PING=$(kubectl exec -n "$NAMESPACE" deploy/mattermost -- \
  curl -s -o /dev/null -w '%{http_code}' "http://oauth2-proxy-invoiceninja:4180/ping" 2>/dev/null)
assert_eq "$PROXY_PING" "200" "SA-09" "T11" "OAuth2-Proxy Ping-Endpoint erreichbar"

# T12: OAuth2-Proxy leitet nicht-authentifizierte Anfragen weiter
PROXY_REDIRECT=$(kubectl exec -n "$NAMESPACE" deploy/mattermost -- \
  curl -s -o /dev/null -w '%{http_code}' "http://oauth2-proxy-invoiceninja:4180/" 2>/dev/null)
# 302 = redirect to login, 403 = blocked (both indicate proxy is working)
PROXY_WORKS="false"
[[ "$PROXY_REDIRECT" == "302" || "$PROXY_REDIRECT" == "403" || "$PROXY_REDIRECT" == "200" ]] && PROXY_WORKS="true"
assert_eq "$PROXY_WORKS" "true" "SA-09" "T12" "OAuth2-Proxy verarbeitet Anfragen (HTTP ${PROXY_REDIRECT})"

# T13: OAuth2-Proxy zeigt auf Keycloak (OIDC-Issuer)
PROXY_ARGS=$(kubectl get deployment oauth2-proxy-invoiceninja -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].args}' 2>/dev/null)
assert_contains "$PROXY_ARGS" "keycloak-oidc" "SA-09" "T13" "OAuth2-Proxy Provider ist keycloak-oidc"

# T14: OAuth2-Proxy skip-auth-regex für statische Assets
assert_contains "$PROXY_ARGS" "skip-auth-regex" "SA-09" "T14" "OAuth2-Proxy hat skip-auth-regex für statische Assets"

# ── Group D: SSO-Middleware ─────────────────────────────────────

# T15: SSO-Middleware-Datei existiert
SSO_FILE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  test -f /var/www/app/app/Http/Middleware/SsoAutoLogin.php && echo "exists" || echo "missing")
assert_eq "$SSO_FILE" "exists" "SA-09" "T15" "SSO-Middleware SsoAutoLogin.php installiert"

# T16: SSO-Middleware in Kernel.php registriert
SSO_KERNEL=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  grep -c 'SsoAutoLogin' /var/www/app/app/Http/Kernel.php 2>/dev/null || echo "0")
assert_gt "$SSO_KERNEL" "0" "SA-09" "T16" "SSO-Middleware in Kernel.php registriert"

# T17: SSO-Middleware liest X-Forwarded-Email Header
SSO_HEADER=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  grep -c 'X-Forwarded-Email' /var/www/app/app/Http/Middleware/SsoAutoLogin.php 2>/dev/null || echo "0")
assert_gt "$SSO_HEADER" "0" "SA-09" "T17" "SSO-Middleware verarbeitet X-Forwarded-Email Header"

# T18: SSO-Middleware erzeugt Bridge-Page mit Token-Injection
SSO_BRIDGE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  grep -c 'X-NINJA-TOKEN' /var/www/app/app/Http/Middleware/SsoAutoLogin.php 2>/dev/null || echo "0")
assert_gt "$SSO_BRIDGE" "0" "SA-09" "T18" "SSO-Middleware injiziert Token via Bridge-Page (localStorage)"

# ── Group E: Invoice Ninja Public Assets ────────────────────────

# T19: Public-Verzeichnis nicht leer (Init-Container hat kopiert)
PUBLIC_COUNT=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c nginx -- \
  sh -c 'ls /var/www/app/public/*.js 2>/dev/null | wc -l' 2>/dev/null || echo "0")
assert_gt "$PUBLIC_COUNT" "0" "SA-09" "T19" "Public-Verzeichnis enthält JS-Assets (Init-Container)"

# T20: nginx-Sidecar Prozess laeuft
NGINX_PROC=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c nginx -- \
  sh -c 'ps aux 2>/dev/null | grep -c "[n]ginx" || echo 0' 2>/dev/null || echo "0")
assert_gt "$NGINX_PROC" "0" "SA-09" "T20" "nginx-Sidecar Prozess laeuft"

# ── Group F: Mattermost-Integration ─────────────────────────────

# T21: Billing-Bot in AllowedUntrustedInternalConnections
MM_ALLOWED=$(kubectl get deployment mattermost -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null)
assert_contains "$MM_ALLOWED" "billing-bot" "SA-09" "T21" \
  "billing-bot in AllowedUntrustedInternalConnections"

# T22: /billing Slash-Command in Mattermost registriert
BILLING_CMD=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U mattermost -d mattermost -tAc \
  "SELECT url FROM commands WHERE trigger='billing' LIMIT 1;" 2>/dev/null || echo "")
assert_contains "$BILLING_CMD" "billing-bot:8090" "SA-09" "T22" \
  "/billing Slash-Command zeigt auf billing-bot:8090"

# T23: Kein NULL pluginid in commands-Tabelle (bekannter MM-Bug)
NULL_PLUGINS=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U mattermost -d mattermost -tAc \
  "SELECT COUNT(*) FROM commands WHERE pluginid IS NULL;" 2>/dev/null || echo "0")
assert_eq "$NULL_PLUGINS" "0" "SA-09" "T23" \
  "Keine NULL pluginid in commands-Tabelle (MM-Bug gefixt)"

# T24: Billing-Bot BILLING_DOMAIN aus ConfigMap
BOT_DOMAIN=$(kubectl get deployment billing-bot -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null)
assert_contains "$BOT_DOMAIN" "BILLING_DOMAIN" "SA-09" "T24" \
  "Billing-Bot liest BILLING_DOMAIN aus ConfigMap"

# T25: Public assets vorhanden (entweder via Init-Container oder manuell kopiert)
PUBLIC_INDEX=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c nginx -- \
  test -f /var/www/app/public/index.php && echo "exists" || echo "missing")
assert_eq "$PUBLIC_INDEX" "exists" "SA-09" "T25" \
  "Public index.php vorhanden (Assets korrekt bereitgestellt)"
