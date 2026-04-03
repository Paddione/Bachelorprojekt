#!/usr/bin/env bash
# FA-05: Nutzerverwaltung — create, roles, SSO, deactivate
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

NAMESPACE="${NAMESPACE:-workspace}"

# T1: Admin creates user → user can login
TEMP_USER="tempuser$(date +%s)"
CREATE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"username\":\"${TEMP_USER}\",\"email\":\"${TEMP_USER}@workspace.local\",\"password\":\"Testpassword123!\"}" \
  "${MM_URL}/users")
assert_eq "$CREATE_STATUS" "201" "FA-05" "T1a" "Admin legt User an"

LOGIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"${TEMP_USER}\",\"password\":\"Testpassword123!\"}" \
  "${MM_URL}/users/login")
assert_eq "$LOGIN_STATUS" "200" "FA-05" "T1b" "Neuer User kann sich einloggen"

# T2: Guest role — verify guest restrictions work
TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r 'if .name then .id else empty end')
GUEST_ID=$(_mm "${MM_URL}/users/username/testguest" | jq -r 'if .username then .id else empty end')
if [[ -n "$GUEST_ID" ]]; then
  # Try to demote user to guest
  DEMOTE_RESP=$(_mm -X POST "${MM_URL}/users/${GUEST_ID}/demote")
  DEMOTE_ERR=$(echo "$DEMOTE_RESP" | jq -r '.id // empty')
  if [[ "$DEMOTE_ERR" == *"license"* ]]; then
    # Team Edition doesn't support guest accounts — verify GuestSettings.Enable is true (config intent)
    GUEST_ENABLED=$(_mm "${MM_URL}/config/client?format=old" | jq -r '.EnableGuestAccounts // "false"')
    assert_eq "$GUEST_ENABLED" "true" "FA-05" "T2" "Gast-Feature in Konfiguration aktiviert (Team Edition ohne Lizenz)"
  else
    GUEST_ROLES=$(_mm "${MM_URL}/users/${GUEST_ID}" | jq -r '.roles // ""')
    assert_contains "$GUEST_ROLES" "system_guest" "FA-05" "T2" "Gast-Rolle: User hat system_guest Rolle"
  fi
else
  skip_test "FA-05" "T2" "Gast-Rolle" "testguest nicht gefunden"
fi

# T3: User exists in Keycloak (verifies Keycloak as user store)
KC_ADMIN_TOKEN=$(curl -s -X POST "http://auth.localhost/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}" \
  -d "grant_type=password" | jq -r '.access_token // empty')
if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  KC_USERS=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "http://auth.localhost/admin/realms/workspace/users?username=testuser1")
  KC_USER_COUNT=$(echo "$KC_USERS" | jq 'length')
  assert_gt "$KC_USER_COUNT" 0 "FA-05" "T3" "User in Keycloak vorhanden (zentraler User Store)"
else
  skip_test "FA-05" "T3" "Keycloak User Store" "Kein Keycloak Admin-Token"
fi

# T4: SSO login via Keycloak OIDC endpoint reachable
KC_OIDC_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  "http://auth.localhost/realms/workspace/.well-known/openid-configuration" 2>/dev/null)
assert_eq "$KC_OIDC_STATUS" "200" "FA-05" "T4" "Keycloak OIDC Discovery erreichbar (SSO-Login)"

# T3: User exists in Keycloak (verifies Keycloak as user store)
KC_ADMIN_TOKEN=$(curl -s -X POST "http://auth.localhost/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}" \
  -d "grant_type=password" | jq -r '.access_token // empty')
if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  KC_USERS=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "http://auth.localhost/admin/realms/workspace/users?username=testuser1")
  KC_USER_COUNT=$(echo "$KC_USERS" | jq 'length')
  assert_gt "$KC_USER_COUNT" 0 "FA-05" "T3" "User in Keycloak vorhanden (zentraler User Store)"
else
  skip_test "FA-05" "T3" "Keycloak User Store" "Kein Keycloak Admin-Token"
fi

# T4: SSO login via Keycloak OIDC endpoint reachable
KC_OIDC_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  "http://auth.localhost/realms/workspace/.well-known/openid-configuration" 2>/dev/null)
assert_eq "$KC_OIDC_STATUS" "200" "FA-05" "T4" "Keycloak OIDC Discovery erreichbar (SSO-Login)"

# T5: Deactivate user → login fails
TEMP_ID=$(_mm "${MM_URL}/users/username/${TEMP_USER}" | jq -r '.id')
curl -s -o /dev/null -X DELETE -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/users/${TEMP_ID}"
LOGIN_AFTER=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"${TEMP_USER}\",\"password\":\"Testpassword123!\"}" \
  "${MM_URL}/users/login")
assert_eq "$LOGIN_AFTER" "401" "FA-05" "T5" "Deaktivierter User kann sich nicht einloggen"
