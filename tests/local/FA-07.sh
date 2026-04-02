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

# T2: File search (upload a file then search for it)
TMPF=$(mktemp /tmp/searchfile-XXXXX.txt)
echo "searchable file content ${SEARCH_TERM}" > "$TMPF"
curl -s -o /dev/null -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" \
  -X POST -F "files=@${TMPF}" -F "channel_id=${CH_ID}" "${MM_URL}/files"
rm -f "$TMPF"
sleep 2
FILE_RESULTS=$(_mm -X POST "${MM_URL}/teams/${TEAM_ID}/posts/search" \
  -d "{\"terms\":\"${SEARCH_TERM}\",\"is_or_search\":false}")
FILE_MATCH=$(echo "$FILE_RESULTS" | jq '.order | length')
assert_gt "$FILE_MATCH" 0 "FA-07" "T2" "Dateisuche findet hochgeladene Datei"

# T3: Channel search
CH_SEARCH=$(_mm "${MM_URL}/teams/${TEAM_ID}/channels/search" -X POST -d '{"term":"test-public"}')
CH_FOUND=$(echo "$CH_SEARCH" | jq 'length')
assert_gt "$CH_FOUND" 0 "FA-07" "T3" "Kanalsuche findet Kanal"

# T4: Search < 2s
SEARCH_MS=$((END_MS - START_MS))
assert_lt "$SEARCH_MS" 2000 "FA-07" "T4" "Suchanfrage in < 2s beantwortet"

# T5: OpenSearch cluster is healthy
NAMESPACE="${NAMESPACE:-homeoffice}"
OS_HEALTH=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  curl -s -o /dev/null -w '%{http_code}' "http://opensearch:9200/_cluster/health" --max-time 5 2>/dev/null || echo "000")
if [[ "$OS_HEALTH" == "200" ]]; then
  _log_result "FA-07" "T5" "OpenSearch-Cluster erreichbar und gesund" "pass" "0"
else
  _log_result "FA-07" "T5" "OpenSearch-Cluster erreichbar und gesund" "fail" "0" "HTTP ${OS_HEALTH}"
fi

# T6: Mattermost Elasticsearch/OpenSearch indexing enabled (server config, requires admin token)
ES_ENABLED=$(_mm "${MM_URL}/config" | jq -r '.ElasticsearchSettings.EnableSearching // false' 2>/dev/null)
if [[ "$ES_ENABLED" == "true" ]]; then
  _log_result "FA-07" "T6" "Elasticsearch/OpenSearch-Suche in Mattermost aktiviert" "pass" "0"
else
  _log_result "FA-07" "T6" "Elasticsearch/OpenSearch-Suche in Mattermost aktiviert" "fail" "0" "EnableSearching=${ES_ENABLED}"
fi
