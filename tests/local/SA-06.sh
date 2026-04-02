#!/usr/bin/env bash
# SA-06: RBAC — role permissions, guest restrictions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

# T1: Guest role enforcement — verify guest restrictions
GUEST_ID=$(_mm "${MM_URL}/users/username/testguest" | jq -r 'if .username then .id else empty end')
if [[ -n "$GUEST_ID" ]]; then
  DEMOTE_RESP=$(_mm -X POST "${MM_URL}/users/${GUEST_ID}/demote")
  DEMOTE_ERR=$(echo "$DEMOTE_RESP" | jq -r '.id // empty')
  if [[ "$DEMOTE_ERR" == *"license"* ]]; then
    # Team Edition: guest demotion requires Enterprise. Verify config intent instead.
    GUEST_ENABLED=$(_mm "${MM_URL}/config/client?format=old" | jq -r '.EnableGuestAccounts // "false"')
    assert_eq "$GUEST_ENABLED" "true" "SA-06" "T1" "Gast-Feature aktiviert (Lizenz: Team Edition)"
  else
    GUEST_ROLES=$(_mm "${MM_URL}/users/${GUEST_ID}" | jq -r '.roles // ""')
    assert_contains "$GUEST_ROLES" "system_guest" "SA-06" "T1" "Gast hat system_guest Rolle"
  fi
else
  skip_test "SA-06" "T1" "Guest role check" "testguest nicht gefunden"
fi

TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r 'if .name then .id else empty end')

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
