#!/usr/bin/env bash
# SA-06: RBAC — role permissions, guest restrictions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

# T1: Guest cannot create channels
GUEST_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testguest","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r '.id')

if [[ -n "$GUEST_TOKEN" ]]; then
  GUEST_CH=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${GUEST_TOKEN}" -H "Content-Type: application/json" \
    -d "{\"team_id\":\"${TEAM_ID}\",\"name\":\"rbac-test\",\"display_name\":\"RBAC Test\",\"type\":\"O\"}" \
    "${MM_URL}/channels")
  assert_eq "$GUEST_CH" "403" "SA-06" "T1" "Gast kann keinen Kanal erstellen (403)"
else
  skip_test "SA-06" "T1" "Guest channel create" "Kein Guest-Token"
fi

# T2: Regular user cannot access System Console
USER1_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testuser1","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)

if [[ -n "$USER1_TOKEN" ]]; then
  CONSOLE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${USER1_TOKEN}" "${MM_URL}/config")
  assert_eq "$CONSOLE_STATUS" "403" "SA-06" "T2" "User kann System Console nicht lesen (403)"
else
  skip_test "SA-06" "T2" "System Console access" "Kein User-Token"
fi

# T3: Admin can read config
ADMIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/config")
assert_eq "$ADMIN_STATUS" "200" "SA-06" "T3" "Admin kann System-Konfiguration lesen"

# T4: User cannot see other user's DMs
USER2_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testuser2","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
USER1_ID=$(curl -s -H "Authorization: Bearer ${USER1_TOKEN}" "${MM_URL}/users/me" | jq -r '.id')
ADMIN_ID=$(_mm "${MM_URL}/users/me" | jq -r '.id')
DM_CH_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -X POST \
  -H "Content-Type: application/json" \
  -d "[\"${ADMIN_ID}\",\"${USER1_ID}\"]" "${MM_URL}/channels/direct" | jq -r '.id')

if [[ -n "$USER2_TOKEN" && -n "$DM_CH_ID" ]]; then
  DM_ACCESS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${USER2_TOKEN}" "${MM_URL}/channels/${DM_CH_ID}/posts?page=0&per_page=10")
  assert_eq "$DM_ACCESS" "403" "SA-06" "T4" "User kann fremde DMs nicht lesen"
else
  skip_test "SA-06" "T4" "DM privacy" "Token oder Channel nicht verfügbar"
fi
