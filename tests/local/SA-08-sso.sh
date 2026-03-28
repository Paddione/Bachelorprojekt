#!/usr/bin/env bash
# SA-08: SSO-Integration — Keycloak OIDC für Mattermost, Nextcloud, Jitsi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

KC_INT_URL="http://keycloak:8080"
KC_ADMIN_TOKEN=""

# Helper: curl innerhalb des Docker-Netzwerks via Mattermost-Container
_docker_curl() { docker exec homeoffice-mattermost curl -s "$@" 2>/dev/null; }

# ── Admin-Token holen ────────────────────────────────────────────
KC_ADMIN_TOKEN=$(_docker_curl -X POST "${KC_INT_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
  -d "grant_type=password" | jq -r '.access_token // empty')

if [[ -z "$KC_ADMIN_TOKEN" ]]; then
  skip_test "SA-08" "T1" "Keycloak Client-Konfiguration" "Kein Keycloak Admin-Token"
  skip_test "SA-08" "T2" "Keycloak Client-Konfiguration" "Kein Keycloak Admin-Token"
  skip_test "SA-08" "T3" "Keycloak Client-Konfiguration" "Kein Keycloak Admin-Token"
else
  # ── Group A: Client-Konfiguration ──────────────────────────────

  # T1: Mattermost OIDC Client existiert mit korrekter Redirect-URI
  MM_CLIENT=$(_docker_curl -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_INT_URL}/admin/realms/homeoffice/clients?clientId=mattermost")
  MM_REDIRECT=$(echo "$MM_CLIENT" | jq -r '.[0].redirectUris[0] // empty')
  assert_contains "$MM_REDIRECT" "bachelorprojekt-chat" "SA-08" "T1" \
    "Mattermost OIDC Client — Redirect-URI konfiguriert"

  # T2: Nextcloud OIDC Client existiert mit korrekter Redirect-URI
  NC_CLIENT=$(_docker_curl -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_INT_URL}/admin/realms/homeoffice/clients?clientId=nextcloud")
  NC_REDIRECT=$(echo "$NC_CLIENT" | jq -r '.[0].redirectUris | join(" ") // empty')
  assert_contains "$NC_REDIRECT" "/apps/oidc_login/oidc" "SA-08" "T2" \
    "Nextcloud OIDC Client — Redirect-URI enthält /apps/oidc_login/oidc"

  # T3: Jitsi OIDC Client existiert mit korrekter Redirect-URI
  JITSI_CLIENT=$(_docker_curl -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_INT_URL}/admin/realms/homeoffice/clients?clientId=jitsi")
  JITSI_REDIRECT=$(echo "$JITSI_CLIENT" | jq -r '.[0].redirectUris[0] // empty')
  assert_contains "$JITSI_REDIRECT" "/oidc/tokenize" "SA-08" "T3" \
    "Jitsi OIDC Client — Redirect-URI enthält /oidc/tokenize"
fi

# ── Group B: OIDC Redirect-Chains ─────────────────────────────

# T4: Mattermost → Keycloak Redirect
# Enterprise-Image nutzt GitLab-OAuth (/oauth/gitlab/login) statt OpenID Connect.
MM_OIDC_REDIRECT=""
for endpoint in "/oauth/gitlab/login" "/oauth/openid_connect/login"; do
  MM_OIDC_STATUS=$(docker exec homeoffice-mattermost \
    curl -s -o /dev/null -w '%{http_code}' "http://localhost:8065${endpoint}" 2>/dev/null)
  if [[ "$MM_OIDC_STATUS" == "302" ]]; then
    MM_OIDC_REDIRECT=$(docker exec homeoffice-mattermost \
      curl -s -o /dev/null -D - "http://localhost:8065${endpoint}" 2>/dev/null \
      | grep -i '^location:' | tr -d '\r')
    break
  fi
done
if [[ -n "$MM_OIDC_REDIRECT" ]]; then
  assert_contains "$MM_OIDC_REDIRECT" "realms/homeoffice" "SA-08" "T4" \
    "Mattermost SSO-Login leitet zu Keycloak weiter"
else
  skip_test "SA-08" "T4" "Mattermost SSO-Redirect" "Kein SSO-Endpoint verfügbar"
fi

# T5: Nextcloud → Keycloak Redirect
NC_OIDC_REDIRECT=$(docker exec homeoffice-nextcloud \
  curl -s -o /dev/null -D - "http://localhost/apps/oidc_login/oidc" 2>/dev/null \
  | grep -i '^location:' | tr -d '\r')
assert_contains "$NC_OIDC_REDIRECT" "realms/homeoffice" "SA-08" "T5" \
  "Nextcloud OIDC-Login leitet zu Keycloak weiter"

# T6: Jitsi Adapter → Keycloak Redirect
JITSI_STATE='{"room":"testroom","tenant":""}'
JITSI_OIDC_REDIRECT=$(docker exec homeoffice-jitsi-web \
  curl -s -o /dev/null -D - \
  "http://jitsi-keycloak-adapter:9000/oidc/auth?state=$(echo "$JITSI_STATE" | jq -sRr @uri)" 2>/dev/null \
  | grep -i '^location:' | tr -d '\r')
assert_contains "$JITSI_OIDC_REDIRECT" "realms/homeoffice" "SA-08" "T6" \
  "Jitsi Adapter leitet zu Keycloak weiter"

# T7: Mattermost redirect enthält client_id=mattermost
if [[ -n "$MM_OIDC_REDIRECT" ]]; then
  assert_contains "$MM_OIDC_REDIRECT" "client_id=mattermost" "SA-08" "T7" \
    "Mattermost Redirect enthält client_id=mattermost"
else
  skip_test "SA-08" "T7" "Mattermost client_id" "Kein SSO-Endpoint verfügbar"
fi

# T8: Nextcloud redirect enthält client_id=nextcloud
assert_contains "$NC_OIDC_REDIRECT" "client_id=nextcloud" "SA-08" "T8" \
  "Nextcloud Redirect enthält client_id=nextcloud"

# T9: Jitsi redirect enthält client_id=jitsi und KEIN prompt=consent
assert_contains "$JITSI_OIDC_REDIRECT" "client_id=jitsi" "SA-08" "T9a" \
  "Jitsi Redirect enthält client_id=jitsi"
assert_not_contains "$JITSI_OIDC_REDIRECT" "prompt=consent" "SA-08" "T9b" \
  "Jitsi Redirect enthält KEIN prompt=consent (SSO-Fix)"

# ── Group C: Token-Exchange & Konfiguration ────────────────────

# T10: Keycloak Token-Endpoint liefert access_token für testuser1
TEST_PASS="${MM_TEST_ADMIN_PASS:-Testpassword123!}"
TOKEN_RESPONSE=$(_docker_curl -X POST "${KC_INT_URL}/realms/homeoffice/protocol/openid-connect/token" \
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
  USERINFO=$(_docker_curl -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" \
    "${KC_INT_URL}/realms/homeoffice/protocol/openid-connect/userinfo")
  UI_USERNAME=$(echo "$USERINFO" | jq -r '.preferred_username // empty')
  UI_EMAIL=$(echo "$USERINFO" | jq -r '.email // empty')
  assert_eq "$UI_USERNAME" "testuser1" "SA-08" "T11a" \
    "Keycloak Userinfo liefert preferred_username=testuser1"
  assert_eq "$UI_EMAIL" "testuser1@homeoffice.local" "SA-08" "T11b" \
    "Keycloak Userinfo liefert korrekte E-Mail"
else
  skip_test "SA-08" "T11a" "Keycloak Userinfo Username" "Kein User-Token"
  skip_test "SA-08" "T11b" "Keycloak Userinfo E-Mail" "Kein User-Token"
fi

# T12: Jitsi Adapter Health-Endpoint erreichbar
ADAPTER_HEALTH=$(docker exec homeoffice-jitsi-web \
  curl -s -o /dev/null -w '%{http_code}' "http://jitsi-keycloak-adapter:9000/oidc/health" 2>/dev/null || echo "000")
assert_eq "$ADAPTER_HEALTH" "200" "SA-08" "T12" \
  "Jitsi Keycloak-Adapter Health-Endpoint erreichbar"

# T13: Nextcloud OIDC-Konfiguration geladen
NC_OIDC_URL=$(docker exec -u www-data homeoffice-nextcloud \
  php occ config:system:get oidc_login_provider_url 2>/dev/null || echo "")
assert_contains "$NC_OIDC_URL" "realms/homeoffice" "SA-08" "T13" \
  "Nextcloud oidc_login_provider_url konfiguriert"

# T14: Zweiter Token-Request funktioniert (Session-Konsistenz)
TOKEN_RESPONSE_2=$(_docker_curl -X POST "${KC_INT_URL}/realms/homeoffice/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=testuser1" \
  -d "password=${TEST_PASS}" \
  -d "grant_type=password")
USER_TOKEN_2=$(echo "$TOKEN_RESPONSE_2" | jq -r '.access_token // empty')
assert_gt "${#USER_TOKEN_2}" "10" "SA-08" "T14" \
  "Zweiter Token-Request liefert access_token (Session-Konsistenz)"
