#!/usr/bin/env bash
# FA-31: Dashboard auth-gate smoke test — unauthenticated request redirects to Keycloak
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"
DASHBOARD_URL="https://dashboard.${DOMAIN}"

# T1: Dashboard URL is reachable (any 2xx/3xx counts)
STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${DASHBOARD_URL}/" 2>/dev/null || echo "000")
assert_match "$STATUS" "^(200|301|302|303|307|308)$" "FA-31" "T1" "Dashboard-URL erreichbar (${DASHBOARD_URL})"

# T2: Unauthenticated request is redirected to Keycloak (oauth2-proxy behaviour)
REDIRECT=$(curl -sk -o /dev/null -w '%{redirect_url}' --max-time 10 "${DASHBOARD_URL}/" 2>/dev/null || echo "")
if [[ "$REDIRECT" == *"auth.${DOMAIN}"* ]] || [[ "$REDIRECT" == *"/oauth2/sign_in"* ]] || [[ "$REDIRECT" == *"/realms/workspace"* ]]; then
  _log_result "FA-31" "T2" "Unauthentifizierter Zugriff leitet zu Keycloak weiter" "pass" "0"
else
  # Follow redirects and check final URL contains Keycloak
  FINAL_URL=$(curl -skL -o /dev/null -w '%{url_effective}' --max-time 15 "${DASHBOARD_URL}/" 2>/dev/null || echo "")
  if [[ "$FINAL_URL" == *"auth.${DOMAIN}"* ]] || [[ "$FINAL_URL" == *"/realms/workspace"* ]]; then
    _log_result "FA-31" "T2" "Unauthentifizierter Zugriff leitet zu Keycloak weiter" "pass" "0"
  else
    _log_result "FA-31" "T2" "Unauthentifizierter Zugriff leitet zu Keycloak weiter" "fail" "0" \
      "Kein Keycloak-Redirect — redirect=${REDIRECT} final=${FINAL_URL}"
  fi
fi

# T3: Dashboard pod is Running
POD_STATUS=$(kubectl --context "${PROD_CONTEXT:-mentolder}" -n workspace get deploy/dashboard-web \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${POD_STATUS:-0}" 0 "FA-31" "T3" "dashboard-web Deployment bereit (${POD_STATUS} Ready)"

# T4: oauth2-proxy-dashboard pod is Running
PROXY_STATUS=$(kubectl --context "${PROD_CONTEXT:-mentolder}" -n workspace get deploy/oauth2-proxy-dashboard \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${PROXY_STATUS:-0}" 0 "FA-31" "T4" "oauth2-proxy-dashboard Deployment bereit (${PROXY_STATUS} Ready)"
