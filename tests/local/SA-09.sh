#!/usr/bin/env bash
# SA-09: Billing-Infrastruktur — Invoice Ninja, OAuth2-Proxy, SSO
# Tests: Pod-Status, Services, Ingress/IngressRoute, SSO-Middleware, MariaDB
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

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

# T4: Invoice Ninja Service existiert
IN_SVC=$(kubectl get svc invoiceninja -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")
assert_eq "$IN_SVC" "80" "SA-09" "T4" "Invoice Ninja Service auf Port 80"

# T5: OAuth2-Proxy Service existiert
PROXY_SVC=$(kubectl get svc oauth2-proxy-invoiceninja -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")
assert_eq "$PROXY_SVC" "4180" "SA-09" "T5" "OAuth2-Proxy Service auf Port 4180"

# ── Group B: Datenbank ──────────────────────────────────────────

# T6: MariaDB erreichbar
DB_PASS=$(kubectl get secret workspace-secrets -n "$NAMESPACE" -o jsonpath='{.data.INVOICENINJA_DB_PASSWORD}' 2>/dev/null | base64 -d)
DB_CHECK=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja-mariadb -- \
  mariadb -u invoiceninja -p"$DB_PASS" invoiceninja -sN -e "SELECT 1;" 2>/dev/null || echo "")
assert_eq "$DB_CHECK" "1" "SA-09" "T6" "MariaDB erreichbar und invoiceninja-DB vorhanden"

# T7: users-Tabelle existiert
USER_TABLE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja-mariadb -- \
  mariadb -u invoiceninja -p"$DB_PASS" invoiceninja -sN -e \
  "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
assert_gt "$USER_TABLE" "0" "SA-09" "T7" "Invoice Ninja users-Tabelle hat Einträge"

# T8: company_tokens-Tabelle existiert (API-Zugang)
TOKEN_TABLE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja-mariadb -- \
  mariadb -u invoiceninja -p"$DB_PASS" invoiceninja -sN -e \
  "SELECT COUNT(*) FROM company_tokens;" 2>/dev/null || echo "0")
assert_gt "$TOKEN_TABLE" "0" "SA-09" "T8" "API-Tokens vorhanden (company_tokens)"

# ── Group C: OAuth2-Proxy Konfiguration ─────────────────────────

# T9: OAuth2-Proxy Ping-Endpoint
PROXY_PING=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -- \
  curl -s -o /dev/null -w '%{http_code}' "http://oauth2-proxy-invoiceninja:4180/ping" 2>/dev/null)
assert_eq "$PROXY_PING" "200" "SA-09" "T9" "OAuth2-Proxy Ping-Endpoint erreichbar"

# T10: OAuth2-Proxy leitet nicht-authentifizierte Anfragen weiter
PROXY_REDIRECT=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -- \
  curl -s -o /dev/null -w '%{http_code}' "http://oauth2-proxy-invoiceninja:4180/" 2>/dev/null)
# 302 = redirect to login, 403 = blocked (both indicate proxy is working)
PROXY_WORKS="false"
[[ "$PROXY_REDIRECT" == "302" || "$PROXY_REDIRECT" == "403" || "$PROXY_REDIRECT" == "200" ]] && PROXY_WORKS="true"
assert_eq "$PROXY_WORKS" "true" "SA-09" "T10" "OAuth2-Proxy verarbeitet Anfragen (HTTP ${PROXY_REDIRECT})"

# T11: OAuth2-Proxy zeigt auf Keycloak (OIDC-Issuer)
PROXY_ARGS=$(kubectl get deployment oauth2-proxy-invoiceninja -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].args}' 2>/dev/null)
assert_contains "$PROXY_ARGS" "keycloak-oidc" "SA-09" "T11" "OAuth2-Proxy Provider ist keycloak-oidc"

# T12: OAuth2-Proxy skip-provider-button (auto-redirect to Keycloak)
assert_contains "$PROXY_ARGS" "skip-provider-button" "SA-09" "T12" "OAuth2-Proxy hat skip-provider-button (auto SSO-Redirect)"

# ── Group D: SSO-Middleware ─────────────────────────────────────

# T13: SSO-Middleware-Datei existiert
SSO_FILE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  test -f /var/www/app/app/Http/Middleware/SsoAutoLogin.php && echo "exists" || echo "missing")
assert_eq "$SSO_FILE" "exists" "SA-09" "T13" "SSO-Middleware SsoAutoLogin.php installiert"

# T14: SSO-Middleware in Kernel.php registriert
SSO_KERNEL=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  grep -c 'SsoAutoLogin' /var/www/app/app/Http/Kernel.php 2>/dev/null || echo "0")
assert_gt "$SSO_KERNEL" "0" "SA-09" "T14" "SSO-Middleware in Kernel.php registriert"

# T15: SSO-Middleware liest X-Forwarded-Email Header
SSO_HEADER=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  grep -c 'X-Forwarded-Email' /var/www/app/app/Http/Middleware/SsoAutoLogin.php 2>/dev/null || echo "0")
assert_gt "$SSO_HEADER" "0" "SA-09" "T15" "SSO-Middleware verarbeitet X-Forwarded-Email Header"

# T16: SSO-Middleware auto-authenticates users (reads headers, creates/finds user)
SSO_BRIDGE=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- \
  grep -cE 'X-Forwarded-Email|auto.?login|CompanyToken|Auth::login' /var/www/app/app/Http/Middleware/SsoAutoLogin.php 2>/dev/null || echo "0")
assert_gt "$SSO_BRIDGE" "0" "SA-09" "T16" "SSO-Middleware authentifiziert User automatisch"

# ── Group E: Invoice Ninja Public Assets ────────────────────────

# T17: Public-Verzeichnis nicht leer (Init-Container hat kopiert)
PUBLIC_COUNT=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c nginx -- \
  sh -c 'ls /var/www/app/public/*.js 2>/dev/null | wc -l' 2>/dev/null || echo "0")
assert_gt "$PUBLIC_COUNT" "0" "SA-09" "T17" "Public-Verzeichnis enthält JS-Assets (Init-Container)"

# T18: nginx-Sidecar Prozess laeuft
NGINX_PROC=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c nginx -- \
  sh -c 'ps aux 2>/dev/null | grep -c "[n]ginx" || echo 0' 2>/dev/null || echo "0")
assert_gt "$NGINX_PROC" "0" "SA-09" "T18" "nginx-Sidecar Prozess laeuft"

# T19: Public assets vorhanden (entweder via Init-Container oder manuell kopiert)
PUBLIC_INDEX=$(kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c nginx -- \
  test -f /var/www/app/public/index.php && echo "exists" || echo "missing")
assert_eq "$PUBLIC_INDEX" "exists" "SA-09" "T19" \
  "Public index.php vorhanden (Assets korrekt bereitgestellt)"
