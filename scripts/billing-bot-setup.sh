#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# billing-bot-setup.sh
#
# 1. Build & push billing-bot image to local registry
# 2. Create /billing slash command in Mattermost
# 3. Create Invoice Ninja API token (first-run only)
#
# Prerequisites:
#   - k3d cluster running with registry
#   - Mattermost deployed and accessible
#   - Invoice Ninja deployed and accessible
#
# Usage:
#   MM_TOKEN=<admin-personal-access-token> bash scripts/billing-bot-setup.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

REGISTRY="${REGISTRY:-localhost:5000}"
MM_URL="${MM_URL:-http://chat.localhost}"
MM_TOKEN="${MM_TOKEN:?Set MM_TOKEN to a Mattermost admin personal access token}"
BILLING_BOT_URL="http://billing-bot:8090"

echo "=== Building billing-bot ==="
docker build -t "${REGISTRY}/billing-bot:latest" billing-bot/
docker push "${REGISTRY}/billing-bot:latest"
echo "✓ Image pushed to ${REGISTRY}/billing-bot:latest"

echo ""
echo "=== Creating Mattermost slash command ==="

# Helper: Mattermost API call
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -s -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H 'Content-Type: application/json' \
    "$@"
}

# Get default team
TEAM_ID=$(mm_api GET "/teams" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
if [ -z "$TEAM_ID" ]; then
  echo "ERROR: Could not find a Mattermost team. Is Mattermost running?"
  exit 1
fi
echo "  Team ID: ${TEAM_ID}"

# Check if /billing command already exists
EXISTING=$(mm_api GET "/commands?team_id=${TEAM_ID}" | python3 -c "
import sys, json
cmds = json.load(sys.stdin)
for c in cmds:
    if c.get('trigger') == 'billing':
        print(c['id'])
        break
" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "  Slash command /billing already exists (ID: ${EXISTING}), updating..."
  mm_api PUT "/commands/${EXISTING}" -d "{
    \"id\": \"${EXISTING}\",
    \"team_id\": \"${TEAM_ID}\",
    \"trigger\": \"billing\",
    \"method\": \"P\",
    \"url\": \"${BILLING_BOT_URL}/slash\",
    \"username\": \"billing-bot\",
    \"icon_url\": \"\",
    \"auto_complete\": true,
    \"auto_complete_desc\": \"Buchhaltung: Rechnungen, Angebote, Ausgaben verwalten\",
    \"auto_complete_hint\": \"[help|client <name>|invoice <kunde>]\"
  }" > /dev/null
else
  echo "  Creating new /billing slash command..."
  mm_api POST "/commands" -d "{
    \"team_id\": \"${TEAM_ID}\",
    \"trigger\": \"billing\",
    \"method\": \"P\",
    \"url\": \"${BILLING_BOT_URL}/slash\",
    \"username\": \"billing-bot\",
    \"icon_url\": \"\",
    \"auto_complete\": true,
    \"auto_complete_desc\": \"Buchhaltung: Rechnungen, Angebote, Ausgaben verwalten\",
    \"auto_complete_hint\": \"[help|client <name>|invoice <kunde>]\"
  }" > /dev/null
fi
echo "✓ Slash command /billing configured"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Usage in Mattermost:"
echo "  /billing              Show action buttons"
echo "  /billing help         Show action buttons"
echo "  /billing client Acme  Quick-create a client"
echo "  /billing invoice Acme Quick-create an invoice for client"
echo ""
echo "NOTE: You need to configure the Invoice Ninja API token."
echo "  1. Open http://billing.localhost"
echo "  2. Go to Settings > Account Management > API Tokens"
echo "  3. Create a new token"
echo "  4. Update the INVOICENINJA_API_TOKEN secret:"
echo "     kubectl edit secret homeoffice-secrets -n homeoffice"
echo "  5. Restart the billing-bot:"
echo "     kubectl rollout restart deployment/billing-bot -n homeoffice"
