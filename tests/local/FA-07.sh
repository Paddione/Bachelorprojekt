#!/usr/bin/env bash
# FA-07: Suche — search messages, files, channels
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

TEAM_ID=$(_mm "${MM_URL}/teams/name/testteam" | jq -r '.id')
CH_ID=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id')

# Post searchable message
SEARCH_TERM="uniqueSearchTerm$(date +%s)"
_mm -X POST "${MM_URL}/posts" -d "{\"channel_id\":\"${CH_ID}\",\"message\":\"${SEARCH_TERM}\"}" > /dev/null
sleep 2

# T1: Search finds message
START_MS=$(date +%s%3N)
RESULTS=$(_mm -X POST "${MM_URL}/teams/${TEAM_ID}/posts/search" \
  -d "{\"terms\":\"${SEARCH_TERM}\",\"is_or_search\":false}")
END_MS=$(date +%s%3N)
MATCH_COUNT=$(echo "$RESULTS" | jq '.order | length')
assert_gt "$MATCH_COUNT" 0 "FA-07" "T1" "Volltextsuche findet Nachricht"

# T4: Search < 2s
SEARCH_MS=$((END_MS - START_MS))
assert_lt "$SEARCH_MS" 2000 "FA-07" "T4" "Suchanfrage in < 2s beantwortet"

# T3: Channel search
CH_SEARCH=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/search" -X POST -d '{"term":"test-public"}')
CH_FOUND=$(echo "$CH_SEARCH" | jq 'length')
assert_gt "$CH_FOUND" 0 "FA-07" "T3" "Kanalsuche findet Kanal"
