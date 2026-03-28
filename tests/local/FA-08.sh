#!/usr/bin/env bash
# FA-08: Homeoffice-spezifisch — custom status
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

# T1: Set status to busy
SET_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d '{"status":"dnd"}' "${MM_URL}/users/me/status")
assert_eq "$SET_STATUS" "200" "FA-08" "T1" "Status auf 'Beschäftigt' setzbar"

# T2: Custom status text
CUSTOM_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d '{"emoji":"house","text":"Im Homeoffice bis 17:00","duration":"today"}' \
  "${MM_URL}/users/me/status/custom")
assert_eq "$CUSTOM_STATUS" "200" "FA-08" "T2" "Custom-Status-Text gesetzt"

# T3: Status visible to other user
USER1_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testuser1","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
ADMIN_ID=$(_mm "${MM_URL}/users/me" | jq -r '.id')
VISIBLE_STATUS=$(curl -s -H "Authorization: Bearer ${USER1_TOKEN}" "${MM_URL}/users/${ADMIN_ID}/status" | jq -r '.status')
assert_eq "$VISIBLE_STATUS" "dnd" "FA-08" "T3" "Status für andere User sichtbar"

# Cleanup
curl -s -o /dev/null -X DELETE -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/users/me/status/custom"
curl -s -o /dev/null -X PUT -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" -d '{"status":"online"}' "${MM_URL}/users/me/status"
