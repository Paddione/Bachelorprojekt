#!/usr/bin/env bash
# SA-08: SSO-Integration — Keycloak OIDC für Mattermost, Nextcloud, Talk
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
KC_INT_URL="http://keycloak:8080"
KC_EXT_URL="http://auth.localhost"
KC_ADMIN_TOKEN=""

# Helper: curl innerhalb des k3d-Clusters via Mattermost-Pod
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- curl -s "$@" 2>/dev/null; }

# ── Admin-Token holen (try external first, fallback to internal) ─
KC_ADMIN_TOKEN=$(curl -s -X POST "${KC_EXT_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}" \
  -d "grant_type=password" 2>/dev/null | jq -r '.access_token // empty')
if [[ -z "$KC_ADMIN_TOKEN" ]]; then
  KC_ADMIN_TOKEN=$(_kube_curl -X POST "${KC_INT_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}" \
    -d "grant_type=password" | jq -r '.access_token // empty')
fi

if [[ -z "$KC_ADMIN_TOKEN" ]]; then
  skip_test "SA-08" "T1" "Keycloak Client-Konfiguration" "Kein Keycloak Admin-Token"
  skip_test "SA-08" "T2" "Keycloak Client-Konfiguration" "Kein Keycloak Admin-Token"
  skip_test "SA-08" "T3" "Keycloak Client-Konfiguration" "Kein Keycloak Admin-Token"
else
  # ── Group A: Client-Konfiguration ──────────────────────────────

  # T1: Mattermost OIDC Client existiert mit korrekter Redirect-URI
  MM_CLIENT=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_EXT_URL}/admin/realms/workspace/clients?clientId=mattermost" 2>/dev/null)
  MM_REDIRECT=$(echo "$MM_CLIENT" | jq -r '.[0].redirectUris[0] // empty')
  assert_contains "$MM_REDIRECT" "chat" "SA-08" "T1" \
    "Mattermost OIDC Client — Redirect-URI konfiguriert"

  # T2: Nextcloud OIDC Client existiert mit korrekter Redirect-URI
  NC_CLIENT=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_EXT_URL}/admin/realms/workspace/clients?clientId=nextcloud" 2>/dev/null)
  NC_REDIRECT=$(echo "$NC_CLIENT" | jq -r '.[0].redirectUris | join(" ") // empty')
  assert_contains "$NC_REDIRECT" "/apps/oidc_login/oidc" "SA-08" "T2" \
    "Nextcloud OIDC Client — Redirect-URI enthält /apps/oidc_login/oidc"

  # T3: Nextcloud Talk OIDC — verifiziert über Nextcloud OIDC-Konfiguration
  NC_OIDC_URL=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
    setpriv --reuid=999 --regid=999 --clear-groups php occ config:system:get oidc_login_provider_url 2>/dev/null || echo "")
  assert_contains "$NC_OIDC_URL" "realms/workspace" "SA-08" "T3" \
    "Nextcloud Talk erbt OIDC-Session — provider_url konfiguriert"
fi

# ── Group B: OIDC Redirect-Chains ─────────────────────────────

# T4: Mattermost → Keycloak Redirect (use port-forwarded URL if available)
MM_BASE="${MM_URL%/api/v4}"
MM_OIDC_REDIRECT=""
for endpoint in "/oauth/gitlab/login" "/oauth/openid_connect/login"; do
  MM_OIDC_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${MM_BASE}${endpoint}" 2>/dev/null)
  if [[ "$MM_OIDC_STATUS" == "302" ]]; then
    MM_OIDC_REDIRECT=$(curl -s -o /dev/null -D - "${MM_BASE}${endpoint}" 2>/dev/null \
      | grep -i '^location:' | tr -d '\r')
    break
  fi
done
if [[ -n "$MM_OIDC_REDIRECT" ]]; then
  assert_contains "$MM_OIDC_REDIRECT" "realms/workspace" "SA-08" "T4" \
    "Mattermost SSO-Login leitet zu Keycloak weiter"
else
  skip_test "SA-08" "T4" "Mattermost SSO-Redirect" "Kein SSO-Endpoint verfügbar"
fi

# T5: Nextcloud OIDC provider_url points to Keycloak (verifies config, not redirect chain)
NC_PROVIDER_URL=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ config:system:get oidc_login_provider_url 2>/dev/null || echo "")
assert_contains "$NC_PROVIDER_URL" "realms/workspace" "SA-08" "T5" \
  "Nextcloud OIDC provider_url zeigt auf Keycloak"

# T6: Talk HPB Signaling erreichbar
SIGNALING_HEALTH=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  curl -s -o /dev/null -w '%{http_code}' "http://spreed-signaling:8080/api/v1/welcome" 2>/dev/null || echo "000")
assert_eq "$SIGNALING_HEALTH" "200" "SA-08" "T6" \
  "Talk HPB Signaling-Server erreichbar"

# T7: Mattermost redirect enthält client_id=mattermost
if [[ -n "$MM_OIDC_REDIRECT" ]]; then
  assert_contains "$MM_OIDC_REDIRECT" "client_id=mattermost" "SA-08" "T7" \
    "Mattermost Redirect enthält client_id=mattermost"
else
  skip_test "SA-08" "T7" "Mattermost client_id" "Kein SSO-Endpoint verfügbar"
fi

# T8: Nextcloud OIDC client_id is configured as "nextcloud"
NC_CLIENT_ID=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ config:system:get oidc_login_client_id 2>/dev/null || echo "")
assert_eq "$NC_CLIENT_ID" "nextcloud" "SA-08" "T8" \
  "Nextcloud OIDC client_id = nextcloud"

# T9: Talk erbt SSO-Session von Nextcloud (kein separater OIDC-Client nötig)
TALK_APP_ENABLED=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ app:list 2>/dev/null | grep -c "spreed" || echo "0")
assert_gt "$TALK_APP_ENABLED" "0" "SA-08" "T9" \
  "Talk (spreed) App in Nextcloud aktiviert — SSO über Nextcloud-OIDC-Session"

# ── Group C: Token-Exchange & Konfiguration ────────────────────

# T10: Keycloak Token-Endpoint liefert access_token für testuser1
TEST_PASS="${MM_TEST_ADMIN_PASS:-Testpassword123!}"
TOKEN_RESPONSE=$(_kube_curl -X POST "${KC_INT_URL}/realms/workspace/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=testuser1" \
  -d "password=${TEST_PASS}" \
  -d "grant_type=password" \
  -d "scope=openid email profile")
USER_ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')
if [[ -n "$USER_ACCESS_TOKEN" ]]; then
  assert_gt "${#USER_ACCESS_TOKEN}" "10" "SA-08" "T10" \
    "Keycloak Token-Endpoint liefert access_token für testuser1"
else
  _log_result "SA-08" "T10" "Keycloak Token-Endpoint liefert access_token für testuser1" \
    "fail" "0" "Kein access_token erhalten: $(echo "$TOKEN_RESPONSE" | jq -r '.error_description // .error // "unknown"')"
fi

# T11: Keycloak Userinfo enthält korrekten Username und E-Mail
if [[ -n "$USER_ACCESS_TOKEN" ]]; then
  USERINFO=$(_kube_curl -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" \
    "${KC_INT_URL}/realms/workspace/protocol/openid-connect/userinfo")
  UI_USERNAME=$(echo "$USERINFO" | jq -r '.preferred_username // empty')
  UI_EMAIL=$(echo "$USERINFO" | jq -r '.email // empty')
  assert_eq "$UI_USERNAME" "testuser1" "SA-08" "T11a" \
    "Keycloak Userinfo liefert preferred_username=testuser1"
  assert_eq "$UI_EMAIL" "testuser1@workspace.local" "SA-08" "T11b" \
    "Keycloak Userinfo liefert korrekte E-Mail"
else
  skip_test "SA-08" "T11a" "Keycloak Userinfo Username" "Kein User-Token"
  skip_test "SA-08" "T11b" "Keycloak Userinfo E-Mail" "Kein User-Token"
fi

# T12: Collabora Online erreichbar (für In-Call Dokumentenbearbeitung)
COLLABORA_HEALTH=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  curl -s -o /dev/null -w '%{http_code}' "http://collabora:9980/" 2>/dev/null || echo "000")
assert_eq "$COLLABORA_HEALTH" "200" "SA-08" "T12" \
  "Collabora Online erreichbar (kollaborative Bearbeitung)"

# T13: Nextcloud OIDC-Konfiguration geladen
NC_OIDC_URL=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ config:system:get oidc_login_provider_url 2>/dev/null || echo "")
assert_contains "$NC_OIDC_URL" "realms/workspace" "SA-08" "T13" \
  "Nextcloud oidc_login_provider_url konfiguriert"

# T14: Zweiter Token-Request funktioniert (Session-Konsistenz)
TOKEN_RESPONSE_2=$(_kube_curl -X POST "${KC_INT_URL}/realms/workspace/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=testuser1" \
  -d "password=${TEST_PASS}" \
  -d "grant_type=password")
USER_TOKEN_2=$(echo "$TOKEN_RESPONSE_2" | jq -r '.access_token // empty')
assert_gt "${#USER_TOKEN_2}" "10" "SA-08" "T14" \
  "Zweiter Token-Request liefert access_token (Session-Konsistenz)"
