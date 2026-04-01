#!/usr/bin/env bash
# mattermost-docs-integration.sh
# Creates a channel bookmark in Mattermost's Town Square pointing to docs.localhost
# Also creates a /docs slash command for quick access.
#
# Prerequisites:
#   - Mattermost running at chat.localhost
#   - Admin credentials (default dev: admin / admin)
#
# Usage: bash scripts/mattermost-docs-integration.sh

set -euo pipefail

MM_URL="${MM_URL:-http://chat.localhost}"
MM_ADMIN="${MM_ADMIN:-admin}"
MM_PASS="${MM_PASS:-admin}"
DOCS_URL="${DOCS_URL:-http://docs.localhost}"
TEAM_NAME="${TEAM_NAME:-homeoffice}"

echo "=== Mattermost Docs Integration ==="
echo "  Mattermost: ${MM_URL}"
echo "  Docs:       ${DOCS_URL}"
echo ""

# 1. Login and get token
echo "Logging in as ${MM_ADMIN}..."
LOGIN_RESPONSE=$(curl -s -i -X POST "${MM_URL}/api/v4/users/login" \
  -H 'Content-Type: application/json' \
  -d "{\"login_id\": \"${MM_ADMIN}\", \"password\": \"${MM_PASS}\"}")

TOKEN=$(echo "${LOGIN_RESPONSE}" | grep -i '^token:' | awk '{print $2}' | tr -d '\r')

if [ -z "${TOKEN}" ]; then
  echo "ERROR: Login failed. Check MM_ADMIN and MM_PASS."
  echo "  Hint: If first run, the admin user may not exist yet."
  exit 1
fi
echo "  Logged in (token: ${TOKEN:0:8}...)"

AUTH="-H \"Authorization: Bearer ${TOKEN}\""

# Helper: authenticated curl
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -s -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    "$@"
}

# 2. Get team ID
echo "Looking up team '${TEAM_NAME}'..."
TEAM_ID=$(mm_api GET "/teams/name/${TEAM_NAME}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -z "${TEAM_ID}" ]; then
  echo "  Team '${TEAM_NAME}' not found. Listing available teams..."
  mm_api GET "/teams" | python3 -c "import sys,json; [print(f'  - {t[\"name\"]} ({t[\"display_name\"]})') for t in json.load(sys.stdin)]"
  echo "  Set TEAM_NAME to one of the above and retry."
  exit 1
fi
echo "  Team ID: ${TEAM_ID}"

# 3. Get Town Square channel ID (default channel)
echo "Looking up 'town-square' channel..."
CHANNEL_ID=$(mm_api GET "/teams/${TEAM_ID}/channels/name/town-square" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -z "${CHANNEL_ID}" ]; then
  echo "ERROR: Could not find town-square channel."
  exit 1
fi
echo "  Channel ID: ${CHANNEL_ID}"

# 4. Set channel header to include docs link
echo "Updating channel header with docs link..."
mm_api PUT "/channels/${CHANNEL_ID}" \
  -d "{\"id\": \"${CHANNEL_ID}\", \"header\": \"[KORE Docs](${DOCS_URL}) | Homeoffice MVP Development\"}" > /dev/null

echo "  Channel header updated."

# 5. Create a slash command /docs
echo "Creating /docs slash command..."
COMMAND_RESPONSE=$(mm_api POST "/commands" \
  -d "{
    \"team_id\": \"${TEAM_ID}\",
    \"trigger\": \"docs\",
    \"method\": \"G\",
    \"url\": \"${DOCS_URL}\",
    \"display_name\": \"KORE Docs\",
    \"description\": \"Open KORE platform documentation\",
    \"auto_complete\": true,
    \"auto_complete_hint\": \"\",
    \"auto_complete_desc\": \"Opens the KORE platform documentation in a new tab\"
  }")

# Check if command already exists
if echo "${COMMAND_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'id' in d else 1)" 2>/dev/null; then
  echo "  /docs slash command created."
else
  echo "  Slash command may already exist (skipping)."
fi

# 6. Post a welcome message with the docs link
echo "Posting docs announcement..."
mm_api POST "/posts" \
  -d "{
    \"channel_id\": \"${CHANNEL_ID}\",
    \"message\": \"### :books: KORE Platform Documentation\nThe project documentation is now available as a live site integrated into our workspace.\n\n**URL:** ${DOCS_URL}\n\nContents:\n- Platform Architecture\n- Homeoffice MVP (Keycloak, Mattermost, Nextcloud, Collabora, Talk HPB)\n- Requirements Overview\n- Admin & User Guides\n- API Reference\n\nThe docs update automatically when changes are pushed to the repository.\"
  }" > /dev/null

echo "  Announcement posted to town-square."

echo ""
echo "=== Integration complete ==="
echo "  Channel header: updated with docs link"
echo "  Slash command:  /docs"
echo "  Announcement:   posted to town-square"
echo "  Docs URL:       ${DOCS_URL}"
