#!/usr/bin/env bash
# FA-05: Nutzerverwaltung — create, roles, deactivate
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

# T1: Admin creates user → user can login
TEMP_USER="tempuser$(date +%s)"
CREATE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"username\":\"${TEMP_USER}\",\"email\":\"${TEMP_USER}@homeoffice.local\",\"password\":\"Testpassword123!\"}" \
  "${MM_URL}/users")
assert_eq "$CREATE_STATUS" "201" "FA-05" "T1" "Admin legt User an"

LOGIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"${TEMP_USER}\",\"password\":\"Testpassword123!\"}" \
  "${MM_URL}/users/login")
assert_eq "$LOGIN_STATUS" "200" "FA-05" "T1b" "Neuer User kann sich einloggen"

# T2: Guest cannot create channels
GUEST_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testguest","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r '.id')
CH_CREATE=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${GUEST_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"team_id\":\"${TEAM_ID}\",\"name\":\"guest-test-ch\",\"display_name\":\"Guest Test\",\"type\":\"O\"}" \
  "${MM_URL}/channels")
assert_eq "$CH_CREATE" "403" "FA-05" "T2" "Gast-Rolle: Kanalerstellung verweigert"

# T5: Deactivate user → login fails
TEMP_ID=$(_mm "${MM_URL}/users/username/${TEMP_USER}" | jq -r '.id')
curl -s -o /dev/null -X DELETE -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/users/${TEMP_ID}"
LOGIN_AFTER=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"${TEMP_USER}\",\"password\":\"Testpassword123!\"}" \
  "${MM_URL}/users/login")
assert_eq "$LOGIN_AFTER" "401" "FA-05" "T5" "Deaktivierter User kann sich nicht einloggen"
