#!/usr/bin/env bash
# FA-04: Dateiablage — upload files via API, check persistence
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

_mm() { curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "$@"; }

TEAM_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/teams/name/testteam" | jq -r '.id')
CH_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id')

# Create test file
TMPFILE=$(mktemp /tmp/testfile-XXXXX.txt)
dd if=/dev/urandom bs=1024 count=100 2>/dev/null | base64 > "$TMPFILE"

# T1: Upload file
UPLOAD_RESP=$(_mm -X POST -F "files=@${TMPFILE}" -F "channel_id=${CH_ID}" "${MM_URL}/files")
FILE_ID=$(echo "$UPLOAD_RESP" | jq -r '.file_infos[0].id // empty')
assert_gt "${#FILE_ID}" 0 "FA-04" "T1" "Datei-Upload erfolgreich"

# T5: Upload different file types
for ext in pdf zip png; do
  TMPF=$(mktemp /tmp/testfile-XXXXX.${ext})
  echo "test content for ${ext}" > "$TMPF"
  UPLOAD_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" \
    -X POST -F "files=@${TMPF}" -F "channel_id=${CH_ID}" "${MM_URL}/files")
  assert_eq "$UPLOAD_STATUS" "201" "FA-04" "T5-${ext}" "Upload .${ext} erfolgreich"
  rm -f "$TMPF"
done

# T4: File persists
if [[ -n "$FILE_ID" ]]; then
  GET_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/files/${FILE_ID}")
  assert_eq "$GET_STATUS" "200" "FA-04" "T4" "Datei nach Upload abrufbar"
fi

rm -f "$TMPFILE"
