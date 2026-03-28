#!/usr/bin/env bash
# FA-06: Benachrichtigungen — notification config checks
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r '.id')
CH_ID=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id')
ADMIN_ID=$(_mm "${MM_URL}/users/me" | jq -r '.id')

# T2: Channel notification config
MUTE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"${ADMIN_ID}\",\"channel_id\":\"${CH_ID}\",\"mark_unread\":\"mention\",\"notify_props\":{\"mark_unread\":\"mention\"}}" \
  "${MM_URL}/channels/${CH_ID}/members/${ADMIN_ID}/notify_props")
assert_eq "$MUTE_STATUS" "200" "FA-06" "T2" "Kanal-Benachrichtigungen konfigurierbar"

# T3: DND status
DND_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d '{"status":"dnd"}' "${MM_URL}/users/me/status")
assert_eq "$DND_STATUS" "200" "FA-06" "T3" "Do-Not-Disturb Status setzbar"

curl -s -o /dev/null -X PUT -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" -d '{"status":"online"}' "${MM_URL}/users/me/status"
