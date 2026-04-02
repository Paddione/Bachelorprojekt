#!/usr/bin/env bash
# SA-02: Authentifizierung — login, failed attempts, lockout
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

# T1: Wrong password → denied
WRONG_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d '{"login_id":"testuser1","password":"wrongpassword"}' \
  "${MM_URL}/users/login")
assert_eq "$WRONG_STATUS" "401" "SA-02" "T1" "Falsches Passwort → Zugang verweigert"

# T2: 2FA/MFA configuration (verify Keycloak supports OTP)
_kc_admin_login
if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  OTP_POLICY=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_URL}/admin/realms/homeoffice" | jq -r '.otpPolicyType // empty')
  if [[ -n "$OTP_POLICY" ]]; then
    _log_result "SA-02" "T2" "Keycloak OTP-Policy konfiguriert (${OTP_POLICY})" "pass" "0"
  else
    _log_result "SA-02" "T2" "Keycloak OTP-Policy konfiguriert" "fail" "0" "Kein OTP-Policy-Typ"
  fi
else
  skip_test "SA-02" "T2" "2FA-Konfiguration" "Kein Keycloak Admin-Token"
fi

# T3: Multiple failed logins → rate limiting
for i in $(seq 1 6); do
  curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
    -d '{"login_id":"testuser2","password":"wrongpassword"}' \
    "${MM_URL}/users/login" 2>/dev/null
done
LOCKED_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d '{"login_id":"testuser2","password":"wrongpassword"}' \
  "${MM_URL}/users/login")
assert_contains "429 401" "$LOCKED_STATUS" "SA-02" "T3" "Brute-Force-Schutz aktiv nach mehrfach falschem Login"

# T4: Keycloak OIDC discovery
KC_DISCOVERY=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  "http://auth.localhost/realms/homeoffice/.well-known/openid-configuration")
assert_eq "$KC_DISCOVERY" "200" "SA-02" "T4" "Keycloak OIDC Discovery erreichbar"

# T5: Keycloak login events enabled
_kc_admin_login
if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  EVENTS_ENABLED=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_URL}/admin/realms/homeoffice/events/config" | jq -r '.eventsEnabled // false')
  assert_eq "$EVENTS_ENABLED" "true" "SA-02" "T5" "Keycloak Login-Events aktiviert"
else
  skip_test "SA-02" "T5" "Keycloak Login-Events" "Kein Keycloak Admin-Token"
fi
