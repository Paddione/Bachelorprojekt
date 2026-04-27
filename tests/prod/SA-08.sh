#!/usr/bin/env bash
# SA-08: SSO-Konsistenz — Keycloak OIDC-Client-Secrets stimmen mit K8s-Secrets überein
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"
KC_URL="https://auth.${DOMAIN}"
KC_CONTEXT="${KUBE_CONTEXT:-mentolder}"
WEBSITE_NS="website"
WORKSPACE_NS="workspace"

# ── Admin-Token holen ─────────────────────────────────────────────
KC_ADMIN_PASSWORD=$(kubectl get secret workspace-secrets -n "$WORKSPACE_NS" \
  --context "$KC_CONTEXT" -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null | base64 -d)

KC_ADMIN_TOKEN=$(curl -s -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=${KC_ADMIN_PASSWORD}" \
  2>/dev/null | jq -r '.access_token // empty')

if [[ -z "$KC_ADMIN_TOKEN" ]]; then
  skip_test "SA-08" "T1" "Keycloak Admin-Token" "Keycloak nicht erreichbar oder Credentials falsch"
  skip_test "SA-08" "T2" "Website OIDC-Secret Konsistenz" "Kein Admin-Token"
  skip_test "SA-08" "T3" "Website OIDC Login-Flow" "Kein Admin-Token"
  exit 0
fi

_log_result "SA-08" "T1" "Keycloak Admin-Token erhalten" "pass" "0"

# ── T2: website OIDC-Secret stimmt mit Keycloak überein ──────────
KC_WEBSITE_SECRET=$(curl -s \
  "${KC_URL}/admin/realms/workspace/clients?clientId=website" \
  -H "Authorization: Bearer $KC_ADMIN_TOKEN" 2>/dev/null \
  | jq -r '.[0].id // empty')

if [[ -z "$KC_WEBSITE_SECRET" ]]; then
  skip_test "SA-08" "T2" "Website OIDC-Secret Konsistenz" "Keycloak client 'website' nicht gefunden"
else
  KC_SECRET=$(curl -s \
    "${KC_URL}/admin/realms/workspace/clients/${KC_WEBSITE_SECRET}/client-secret" \
    -H "Authorization: Bearer $KC_ADMIN_TOKEN" 2>/dev/null \
    | jq -r '.value // empty')

  K8S_SECRET=$(kubectl get secret website-secrets -n "$WEBSITE_NS" \
    --context "$KC_CONTEXT" -o jsonpath='{.data.WEBSITE_OIDC_SECRET}' 2>/dev/null | base64 -d)

  if [[ -z "$KC_SECRET" || -z "$K8S_SECRET" ]]; then
    _log_result "SA-08" "T2" "Website OIDC-Secret Konsistenz" "fail" "0" \
      "KC-Secret oder K8s-Secret leer (KC=${#KC_SECRET} Zeichen, K8s=${#K8S_SECRET} Zeichen)"
  elif [[ "$KC_SECRET" == "$K8S_SECRET" ]]; then
    _log_result "SA-08" "T2" "Website OIDC-Secret stimmt mit Keycloak überein" "pass" "0"
  else
    _log_result "SA-08" "T2" "Website OIDC-Secret stimmt mit Keycloak überein" "fail" "0" \
      "Secret-Mismatch: K8s-Secret passt nicht zum Keycloak-Client-Secret"
  fi
fi

# ── T3: OIDC Login-Flow gibt kein unauthorized_client zurück ─────
LOGIN_PAGE=$(curl -s -L --max-time 10 \
  "https://web.${DOMAIN}/api/auth/signin" 2>/dev/null || echo "")

if echo "$LOGIN_PAGE" | grep -q "unauthorized_client\|Invalid client"; then
  _log_result "SA-08" "T3" "OIDC Login-Flow — kein unauthorized_client" "fail" "0" \
    "unauthorized_client in Login-Antwort — Secret-Mismatch aktiv"
elif [[ -z "$LOGIN_PAGE" ]]; then
  skip_test "SA-08" "T3" "OIDC Login-Flow" "Website nicht erreichbar"
else
  _log_result "SA-08" "T3" "OIDC Login-Flow — kein unauthorized_client" "pass" "0"
fi
