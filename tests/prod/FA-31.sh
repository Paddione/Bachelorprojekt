#!/usr/bin/env bash
# FA-31: /admin/monitoring auth-gate smoke test — unauthenticated request redirects to Keycloak
# Post-PR #555 the operator dashboard lives at https://web.${PROD_DOMAIN}/admin/monitoring,
# served by the website pod. The standalone dashboard.${PROD_DOMAIN} surface no longer exists.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"
MONITORING_URL="https://web.${DOMAIN}/admin/monitoring"
WEBSITE_NS="${WEBSITE_NAMESPACE:-website}"
PROD_CONTEXT="${PROD_CONTEXT:-mentolder}"

# T1: Monitoring URL is reachable (any 2xx/3xx counts)
STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${MONITORING_URL}" 2>/dev/null || echo "000")
assert_match "$STATUS" "^(200|301|302|303|307|308)$" "FA-31" "T1" "Monitoring-URL erreichbar (${MONITORING_URL})"

# T2: Unauthenticated request is redirected to Keycloak (website auth guard)
REDIRECT=$(curl -sk -o /dev/null -w '%{redirect_url}' --max-time 10 "${MONITORING_URL}" 2>/dev/null || echo "")
if [[ "$REDIRECT" == *"auth.${DOMAIN}"* ]] || [[ "$REDIRECT" == *"/realms/workspace"* ]]; then
  _log_result "FA-31" "T2" "Unauthentifizierter Zugriff leitet zu Keycloak weiter" "pass" "0"
else
  FINAL_URL=$(curl -skL -o /dev/null -w '%{url_effective}' --max-time 15 "${MONITORING_URL}" 2>/dev/null || echo "")
  if [[ "$FINAL_URL" == *"auth.${DOMAIN}"* ]] || [[ "$FINAL_URL" == *"/realms/workspace"* ]]; then
    _log_result "FA-31" "T2" "Unauthentifizierter Zugriff leitet zu Keycloak weiter" "pass" "0"
  else
    _log_result "FA-31" "T2" "Unauthentifizierter Zugriff leitet zu Keycloak weiter" "fail" "0" \
      "Kein Keycloak-Redirect — redirect=${REDIRECT} final=${FINAL_URL}"
  fi
fi

# T3: website Deployment is Ready (it serves /admin/monitoring + the auth guard)
POD_STATUS=$(kubectl --context "${PROD_CONTEXT}" -n "${WEBSITE_NS}" get deploy/website \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${POD_STATUS:-0}" 0 "FA-31" "T3" "website Deployment in ${WEBSITE_NS} bereit (${POD_STATUS} Ready)"
