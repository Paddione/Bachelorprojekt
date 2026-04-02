#!/usr/bin/env bash
# FA-06: Benachrichtigungen — notification config, mute, DND, @mention
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r '.id')
CH_ID=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id')
ADMIN_ID=$(_mm "${MM_URL}/users/me" | jq -r '.id')

# T1: Notification preferences exist for user
NOTIF_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/users/${ADMIN_ID}/preferences")
assert_eq "$NOTIF_STATUS" "200" "FA-06" "T1" "Benachrichtigungseinstellungen abrufbar"

# T2: Channel mute — notification level configurable
MUTE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"${ADMIN_ID}\",\"channel_id\":\"${CH_ID}\",\"mark_unread\":\"mention\",\"notify_props\":{\"mark_unread\":\"mention\"}}" \
  "${MM_URL}/channels/${CH_ID}/members/${ADMIN_ID}/notify_props")
assert_eq "$MUTE_STATUS" "200" "FA-06" "T2" "Kanal stummschalten konfigurierbar"

# T3: DND status settable (requires user_id in body)
DND_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"${ADMIN_ID}\",\"status\":\"dnd\"}" "${MM_URL}/users/me/status")
assert_eq "$DND_STATUS" "200" "FA-06" "T3" "Do-Not-Disturb Status setzbar"

# T4: @mention triggers notification (verify mention counts API)
TIMESTAMP=$(date +%s)
USER1_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login_id":"testuser1","password":"Testpassword123!"}' \
  -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
USER1_ID=$(curl -s -H "Authorization: Bearer ${USER1_TOKEN}" "${MM_URL}/users/me" | jq -r '.id')
# Post a message mentioning user1
_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${CH_ID}\",\"message\":\"@testuser1 mention-test-${TIMESTAMP}\"}" > /dev/null
sleep 1
MENTION_COUNT=$(curl -s -H "Authorization: Bearer ${USER1_TOKEN}" \
  "${MM_URL}/channels/${CH_ID}/members/${USER1_ID}" | jq -r '.mention_count // 0')
assert_gt "$MENTION_COUNT" 0 "FA-06" "T4" "@mention erhöht Mention-Counter"

# Cleanup: reset status
curl -s -o /dev/null -X PUT -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" -d "{\"user_id\":\"${ADMIN_ID}\",\"status\":\"online\"}" "${MM_URL}/users/me/status"
