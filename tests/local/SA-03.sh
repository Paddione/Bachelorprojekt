#!/usr/bin/env bash
# SA-03: Passwörter — bcrypt hash, policy, no cleartext
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: bcrypt hash in DB
HASH=$(docker exec homeoffice-mattermost-db psql -U mattermost -d mattermost -t -c \
  "SELECT password FROM users WHERE username='testadmin' LIMIT 1;" 2>/dev/null | tr -d '[:space:]')
assert_match "$HASH" '^\$2[aby]\$' "SA-03" "T1" "Passwort als bcrypt-Hash gespeichert"

# T2: Keycloak password policy
KC_ADMIN_TOKEN=$(curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
  -d "grant_type=password" | jq -r '.access_token // empty')
if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  POLICY=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "http://localhost:8080/admin/realms/homeoffice" | jq -r '.passwordPolicy // empty')
  assert_gt "${#POLICY}" 0 "SA-03" "T2" "Keycloak Password Policy konfiguriert"
else
  skip_test "SA-03" "T2" "Keycloak Password Policy" "Kein Keycloak Admin-Token"
fi

# T3: No cleartext passwords in logs
LOGS=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" logs --tail 200 2>&1)
assert_not_contains "$LOGS" "Testpassword123!" "SA-03" "T3" "Kein Klartext-Passwort in Logs"

# T4: Short password rejected
SHORT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d '{"username":"shortpwuser","email":"shortpw@test.local","password":"abc"}' \
  "${MM_URL}/users")
assert_eq "$SHORT_STATUS" "400" "SA-03" "T4" "Zu kurzes Passwort wird abgelehnt"
