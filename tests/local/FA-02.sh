#!/usr/bin/env bash
# FA-02: Kanäle / Workspaces — public/private channels, teams
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r '.id')

# T1: Public channel — user can join without invite
PUB_CH=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id')
USER1_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testuser1","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
USER1_ID=$(curl -s -H "Authorization: Bearer ${USER1_TOKEN}" "${MM_URL}/users/me" | jq -r '.id')
JOIN_RESULT=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${USER1_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"${USER1_ID}\"}" "${MM_URL}/channels/${PUB_CH}/members")
assert_eq "$JOIN_RESULT" "201" "FA-02" "T1" "User tritt öffentlichem Kanal ohne Einladung bei"

# T2: Private channel — user2 cannot see it
PRIV_CH=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/name/test-private" | jq -r '.id')
USER2_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testuser2","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
PRIV_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${USER2_TOKEN}" "${MM_URL}/channels/${PRIV_CH}")
assert_eq "$PRIV_STATUS" "403" "FA-02" "T2" "Privater Kanal für nicht-eingeladenen User nicht sichtbar"

# T3: Multiple teams
TEAM2_ID=$(_mm "${MM_URL}/teams/name/testteam2" | jq -r '.id // empty')
if [[ -z "$TEAM2_ID" ]]; then
  TEAM2_ID=$(_mm -X POST "${MM_URL}/teams" -d '{"name":"testteam2","display_name":"Test Team 2","type":"O"}' | jq -r '.id')
fi
assert_gt "${#TEAM2_ID}" 0 "FA-02" "T3" "Zweites Team erstellt"

# T4: Channel rename
NEW_NAME="test-public-renamed-$(date +%s)"
RENAME_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"id\":\"${PUB_CH}\",\"display_name\":\"${NEW_NAME}\"}" "${MM_URL}/channels/${PUB_CH}")
assert_eq "$RENAME_STATUS" "200" "FA-02" "T4" "Kanal umbenennen erfolgreich"
