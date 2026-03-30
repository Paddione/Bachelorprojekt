#!/usr/bin/env bash
# FA-01: Messaging (Echtzeit) — send DM, group DM, channel message, persistence
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r '.id')
USER1_ID=$(_mm "${MM_URL}/users/username/testuser1" | jq -r '.id')
USER2_ID=$(_mm "${MM_URL}/users/username/testuser2" | jq -r '.id')
ADMIN_ID=$(_mm "${MM_URL}/users/username/testadmin" | jq -r '.id')

# T1: Send DM
DM_CH=$(_mm -X POST "${MM_URL}/channels/direct" -d "[\"${ADMIN_ID}\",\"${USER1_ID}\"]" | jq -r '.id')
TIMESTAMP=$(date +%s)
DM_MSG=$(_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${DM_CH}\",\"message\":\"dm-test-${TIMESTAMP}\"}" | jq -r '.id')
assert_gt "${#DM_MSG}" 0 "FA-01" "T1" "DM-Nachricht gesendet und ID erhalten"

# T2: Group DM with 3 users
GDM_CH=$(_mm -X POST "${MM_URL}/channels/group" -d "[\"${ADMIN_ID}\",\"${USER1_ID}\",\"${USER2_ID}\"]" | jq -r '.id')
GDM_MSG=$(_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${GDM_CH}\",\"message\":\"group-dm-test-${TIMESTAMP}\"}" | jq -r '.id')
assert_gt "${#GDM_MSG}" 0 "FA-01" "T2" "Gruppen-DM gesendet"

# T3: Channel message
PUB_CH=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id')
CH_MSG=$(_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${PUB_CH}\",\"message\":\"channel-test-${TIMESTAMP}\"}" | jq -r '.id')
assert_gt "${#CH_MSG}" 0 "FA-01" "T3" "Channel-Nachricht gesendet"

# T4: Persistence
FOUND=$(_mm "${MM_URL}/posts/${DM_MSG}" | jq -r '.id // empty')
assert_eq "$FOUND" "$DM_MSG" "FA-01" "T4" "Nachricht nach Senden noch abrufbar"

# T5: Offline delivery — post message, then verify it's retrievable (simulates reconnect)
OFFLINE_MSG=$(_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${DM_CH}\",\"message\":\"offline-test-$(date +%s)\"}" | jq -r '.id')
# Simulate "reconnect" by fetching posts since a timestamp
SINCE=$(( $(date +%s) * 1000 - 5000 ))
POSTS_SINCE=$(_mm "${MM_URL}/channels/${DM_CH}/posts?since=${SINCE}" | jq -r '.order | length')
assert_gt "$POSTS_SINCE" 0 "FA-01" "T5" "Nachrichten nach Reconnect abrufbar (Offline-Zustellung)"

# T6: Message edit (Gap 1.2) — edit a message and verify new content
EDIT_TS=$(date +%s)
EDIT_MSG=$(_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${PUB_CH}\",\"message\":\"before-edit-${EDIT_TS}\"}" | jq -r '.id')
EDIT_RESULT=$(_mm -X PUT "${MM_URL}/posts/${EDIT_MSG}/patch" \
  -d "{\"message\":\"after-edit-${EDIT_TS}\"}")
EDIT_TEXT=$(echo "$EDIT_RESULT" | jq -r '.message // empty')
assert_eq "$EDIT_TEXT" "after-edit-${EDIT_TS}" "FA-01" "T6" "Nachricht bearbeiten erfolgreich"

# T7: Message delete (Gap 1.2) — delete a message and verify it's flagged
DEL_MSG=$(_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${PUB_CH}\",\"message\":\"to-delete-${EDIT_TS}\"}" | jq -r '.id')
DEL_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/posts/${DEL_MSG}")
assert_eq "$DEL_STATUS" "200" "FA-01" "T7" "Nachricht löschen erfolgreich"

# T8: Link preview / unfurling (Gap 1.3) — verify preview metadata setting is active
MM_CONFIG=$(_mm "${MM_URL}/config/client?format=old")
LINK_PREVIEW=$(echo "$MM_CONFIG" | jq -r '.EnableLinkPreviews // "false"')
assert_eq "$LINK_PREVIEW" "true" "FA-01" "T8" "Link-Vorschau (Unfurling) aktiviert"

# T9: Pinned message (Gap 2.5) — pin a message and verify via pins endpoint
PIN_MSG=$(_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${PUB_CH}\",\"message\":\"pin-test-${EDIT_TS}\"}" | jq -r '.id')
PIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
  "${MM_URL}/posts/${PIN_MSG}/pin")
assert_eq "$PIN_STATUS" "200" "FA-01" "T9" "Nachricht anpinnen erfolgreich"
# Verify pin appears in channel pins
PINNED=$(_mm "${MM_URL}/channels/${PUB_CH}/pinned" | jq -r ".order | index(\"${PIN_MSG}\") // empty")
assert_gt "${#PINNED}" 0 "FA-01" "T9b" "Angepinnte Nachricht in Pin-Liste sichtbar"

# T10: Incoming webhook end-to-end (Gap 1.1/S) — create hook, post via curl, verify message
WEBHOOK_ENABLED=$(_mm "${MM_URL}/config/client?format=old" | jq -r '.EnableIncomingWebhooks // "false"')
if [[ "$WEBHOOK_ENABLED" == "true" ]]; then
  WH_PAYLOAD=$(_mm -X POST "${MM_URL}/hooks/incoming" \
    -d "{\"channel_id\":\"${PUB_CH}\",\"display_name\":\"test-hook\",\"description\":\"CI test\"}")
  WH_ID=$(echo "$WH_PAYLOAD" | jq -r '.id // empty')
  if [[ -n "$WH_ID" ]]; then
    WH_URL="${MM_URL%/api/v4}/hooks/${WH_ID}"
    WH_TS=$(date +%s)
    curl -s -X POST -H "Content-Type: application/json" \
      -d "{\"text\":\"webhook-test-${WH_TS}\"}" "$WH_URL" > /dev/null
    sleep 1
    WH_SEARCH=$(_mm -X POST "${MM_URL}/teams/${TEAM_ID}/posts/search" \
      -d "{\"terms\":\"webhook-test-${WH_TS}\",\"is_or_search\":false}")
    WH_FOUND=$(echo "$WH_SEARCH" | jq '.order | length')
    assert_gt "$WH_FOUND" 0 "FA-01" "T10" "Incoming Webhook liefert Nachricht in Kanal"
    # Cleanup
    _mm -X DELETE "${MM_URL}/hooks/incoming/${WH_ID}" > /dev/null
  else
    _log_result "FA-01" "T10" "Incoming Webhook liefert Nachricht in Kanal" "fail" "0" "Webhook-Erstellung fehlgeschlagen"
  fi
else
  skip_test "FA-01" "T10" "Incoming Webhook liefert Nachricht in Kanal" "Webhooks nicht aktiviert"
fi
