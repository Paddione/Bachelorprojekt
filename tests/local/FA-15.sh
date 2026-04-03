#!/usr/bin/env bash
# FA-15: OIDC Website Login — Auth endpoints, Keycloak client
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NS="${WEB_NS:-website}"
KC_NS="${KC_NS:-workspace}"

# ── T1: /api/auth/login redirects (302) ──────────────────────────
WEB_READY=$(kubectl get deployment website -n "$WEB_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

if [[ "$WEB_READY" -gt 0 ]]; then
  AUTH_CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/auth/login',{redirect:'manual'}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$AUTH_CODE" "302" "FA-15" "T1" "/api/auth/login gibt 302 zurueck"
else
  skip_test "FA-15" "T1" "Auth login redirect" "Website nicht bereit"
fi

# ── T2: /api/auth/me returns unauthenticated ─────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  ME_RESULT=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/auth/me').then(r=>r.json()).then(d=>console.log(d.authenticated))" 2>/dev/null || echo "")
  assert_eq "$ME_RESULT" "false" "FA-15" "T2" "/api/auth/me gibt authenticated:false"
else
  skip_test "FA-15" "T2" "Auth me unauthenticated" "Website nicht bereit"
fi

# ── T3: Keycloak has "website" client ─────────────────────────────
KC_READY=$(kubectl get deployment keycloak -n "$KC_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

if [[ "$KC_READY" -gt 0 ]]; then
  KC_PASS=$(kubectl get secret workspace-secrets -n "$KC_NS" \
    -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null | base64 -d)
  TOKEN=$(kubectl exec -n "$KC_NS" deploy/keycloak -- \
    curl -sf -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password&client_id=admin-cli&username=admin&password=${KC_PASS}" 2>/dev/null \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

  if [[ -n "$TOKEN" && ${#TOKEN} -gt 10 ]]; then
    CLIENT_COUNT=$(kubectl exec -n "$KC_NS" deploy/keycloak -- \
      curl -sf -H "Authorization: Bearer $TOKEN" \
      "http://localhost:8080/admin/realms/workspace/clients?clientId=website" 2>/dev/null \
      | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    assert_gt "$CLIENT_COUNT" 0 "FA-15" "T3" "Keycloak 'website' OIDC-Client vorhanden"
  else
    skip_test "FA-15" "T3" "Keycloak website client" "Admin-Token konnte nicht geholt werden"
  fi
else
  skip_test "FA-15" "T3" "Keycloak website client" "Keycloak nicht bereit"
fi

# ── T4: WEBSITE_OIDC_SECRET in ConfigMap ──────────────────────────
OIDC_SEC=$(kubectl get configmap website-config -n "$WEB_NS" \
  -o jsonpath='{.data.WEBSITE_OIDC_SECRET}' 2>/dev/null || echo "")
if [[ -n "$OIDC_SEC" && "$OIDC_SEC" != "" ]]; then
  assert_eq "set" "set" "FA-15" "T4" "WEBSITE_OIDC_SECRET konfiguriert"
else
  skip_test "FA-15" "T4" "OIDC Secret" "WEBSITE_OIDC_SECRET nicht gesetzt"
fi
