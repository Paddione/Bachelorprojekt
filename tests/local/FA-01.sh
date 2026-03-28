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
