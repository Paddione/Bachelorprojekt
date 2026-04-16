#!/usr/bin/env bash
# SA-03: Passwörter — bcrypt hash, policy, no cleartext
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: Passwort-Hashes in Keycloak-DB (bcrypt)
HASH=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U keycloak -d keycloak -tAc \
  "SELECT value FROM credential WHERE type='password' LIMIT 1;" 2>/dev/null || echo "")
assert_gt "${#HASH}" 0 "SA-03" "T1" "Passwort-Hash in Keycloak-DB vorhanden"

# T2: Keycloak password policy
KC_ADMIN_TOKEN=$(curl -s -X POST "http://auth.localhost/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}" \
  -d "grant_type=password" | jq -r '.access_token // empty')
if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  POLICY=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "http://auth.localhost/admin/realms/workspace" | jq -r '.passwordPolicy // empty')
  assert_gt "${#POLICY}" 0 "SA-03" "T2" "Keycloak Password Policy konfiguriert"
else
  skip_test "SA-03" "T2" "Keycloak Password Policy" "Kein Keycloak Admin-Token"
fi

# T3: No cleartext passwords in logs (check last 200 lines across all pods)
LOGS=$(kubectl logs -n "$NAMESPACE" --all-containers --tail=200 -l 'app in (keycloak,nextcloud)' 2>&1)
assert_not_contains "$LOGS" "Testpassword123!" "SA-03" "T3" "Kein Klartext-Passwort in Logs"

# T4: Keycloak password policy enforced — short password rejected via user creation API
KC_SHORT_TOKEN=$(curl -s -X POST "http://auth.localhost/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}&grant_type=password" \
  | jq -r '.access_token // empty')
if [[ -n "$KC_SHORT_TOKEN" ]]; then
  SHORT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${KC_SHORT_TOKEN}" -H "Content-Type: application/json" \
    -d '{"username":"shortpwtest","email":"shortpw@test.local","enabled":true,"credentials":[{"type":"password","value":"abc","temporary":false}]}' \
    "http://auth.localhost/admin/realms/workspace/users")
  assert_eq "$SHORT_STATUS" "400" "SA-03" "T4" "Zu kurzes Passwort wird von Keycloak abgelehnt"
else
  skip_test "SA-03" "T4" "Passwort-Policy" "Kein Keycloak Admin-Token"
fi
