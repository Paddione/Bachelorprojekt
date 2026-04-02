#!/usr/bin/env bash
# SA-04: Session-Timeout — token lifespan, session config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: Keycloak SSO idle timeout configured (<= 30 min)
KC_ADMIN_TOKEN_T1=$(curl -s -X POST "http://auth.localhost/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
  -d "grant_type=password" | jq -r '.access_token // empty')

if [[ -n "$KC_ADMIN_TOKEN_T1" ]]; then
  SSO_IDLE=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN_T1}" \
    "http://auth.localhost/admin/realms/homeoffice" | jq -r '.ssoSessionIdleTimeout // 0')
  assert_lt "$SSO_IDLE" 1801 "SA-04" "T1a" "SSO Session Idle Timeout <= 30min (${SSO_IDLE}s)"
  assert_gt "$SSO_IDLE" 0 "SA-04" "T1b" "SSO Session Idle Timeout konfiguriert"
else
  skip_test "SA-04" "T1a" "SSO Idle Timeout" "Kein Keycloak Admin-Token"
  skip_test "SA-04" "T1b" "SSO Idle Timeout" "Kein Keycloak Admin-Token"
fi

# T2: Keycloak token lifespan
KC_ADMIN_TOKEN=$(curl -s -X POST "http://auth.localhost/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
  -d "grant_type=password" | jq -r '.access_token // empty')

if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  TOKEN_LIFESPAN=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "http://auth.localhost/admin/realms/homeoffice" | jq -r '.accessTokenLifespan // 0')
  assert_lt "$TOKEN_LIFESPAN" 3601 "SA-04" "T2" "Access Token Lifespan <= 60min"
  assert_gt "$TOKEN_LIFESPAN" 0 "SA-04" "T2b" "Access Token Lifespan konfiguriert"
else
  skip_test "SA-04" "T2" "Token Lifespan" "Kein Keycloak Admin-Token"
fi

# T3: Invalid token rejected
EXPIRED_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer invalidtoken12345" "${MM_URL}/users/me")
assert_eq "$EXPIRED_STATUS" "401" "SA-04" "T3" "Ungültiger Token wird abgelehnt"

# T4: Mattermost session timeout
MM_CONFIG=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/config" 2>/dev/null)
SESSION_HOURS=$(echo "$MM_CONFIG" | jq -r '.ServiceSettings.SessionLengthWebInHours // 0')
assert_gt "$SESSION_HOURS" 0 "SA-04" "T4" "Mattermost Session-Timeout konfiguriert"
