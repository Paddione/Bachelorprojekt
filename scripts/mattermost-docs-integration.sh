#!/usr/bin/env bash
# mattermost-docs-integration.sh
# Integrates the KORE Docs site into Mattermost.
#
# Method 1 (preferred): Use mmctl inside the Mattermost pod
# Method 2 (fallback):  Use Mattermost API with a personal access token
#
# Usage:
#   bash scripts/mattermost-docs-integration.sh              # Auto-detect
#   MM_TOKEN=<token> bash scripts/mattermost-docs-integration.sh  # Use API token
#
# Environment variables:
#   MM_URL       - Mattermost URL (default: auto-detect from SiteURL)
#   MM_TOKEN     - Personal access token (skip mmctl, use API directly)
#   DOCS_URL     - Local docs site URL (default: auto-detect from ingress)
#   GITBOOK_URL  - External GitBook URL (for team members outside the cluster)
#   TEAM_NAME    - Team to configure (default: first available team)
#   CHANNEL_NAME - Channel to post in (default: dokumentation)

set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
DOCS_URL="${DOCS_URL:-}"
GITBOOK_URL="${GITBOOK_URL:-}"
MM_URL="${MM_URL:-}"
MM_TOKEN="${MM_TOKEN:-}"
TEAM_NAME="${TEAM_NAME:-}"
CHANNEL_NAME="${CHANNEL_NAME:-dokumentation}"

echo "=== Mattermost Docs Integration ==="

# ── Auto-detect URLs ──────────────────────────────────────────
if [ -z "${DOCS_URL}" ]; then
  # Try to get docs domain from ConfigMap
  DOCS_DOMAIN=$(kubectl get configmap domain-config -n "${NAMESPACE}" -o jsonpath='{.data.DOCS_DOMAIN}' 2>/dev/null || echo "docs.localhost")
  # Match the scheme from Mattermost SiteURL
  MM_SITEURL=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
  SCHEME=$(echo "${MM_SITEURL}" | grep -oP '^https?' || echo "http")
  DOCS_URL="${SCHEME}://${DOCS_DOMAIN}"
fi

if [ -z "${MM_URL}" ]; then
  MM_URL=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
fi

# Auto-detect GitBook URL from ConfigMap if not set
if [ -z "${GITBOOK_URL}" ]; then
  GITBOOK_URL=$(kubectl get configmap domain-config -n "${NAMESPACE}" -o jsonpath='{.data.GITBOOK_URL}' 2>/dev/null || echo "")
fi

echo "  Mattermost: ${MM_URL}"
echo "  Docs:       ${DOCS_URL}"
if [ -n "${GITBOOK_URL}" ]; then
  echo "  GitBook:    ${GITBOOK_URL}"
fi
echo ""

# ── Build announcement message ───────────────────────────────
if [ -n "${GITBOOK_URL}" ]; then
  DOCS_MSG="### :books: KORE Platform Documentation\n\nThe project documentation is available at:\n\n| Resource | URL |\n|----------|-----|\n| **GitBook** | ${GITBOOK_URL} |\n| **Local (Docsify)** | ${DOCS_URL} |\n\nGitBook syncs automatically from the \`docs/\` directory on the \`main\` branch.\n\nContents:\n- Architecture, Services, Keycloak & SSO\n- Invoice Ninja (Billing)\n- Security, Requirements\n- Guides (admin, user, deployment, migration, testing)\n- API Reference"
  HEADER_MSG=":books: [KORE Docs](${GITBOOK_URL}) | [Local](${DOCS_URL}) | Workspace MVP Documentation"
else
  DOCS_MSG="### :books: KORE Platform Documentation\n\nThe project documentation is available at **${DOCS_URL}**\n\nContents:\n- Architecture, Services, Keycloak & SSO\n- Invoice Ninja (Billing)\n- Security, Requirements\n- Guides (admin, user, deployment, migration, testing)\n- API Reference"
  HEADER_MSG=":books: [KORE Docs](${DOCS_URL}) | Workspace MVP Documentation"
fi

# ── Method 1: mmctl (inside pod) ─────────────────────────────
try_mmctl() {
  echo "Trying mmctl (local mode)..."

  # Create incoming webhook
  local TEAM
  TEAM=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local team list --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['name'])" 2>/dev/null) || return 1

  echo "  Team: ${TEAM}"

  local CHANNEL_ID
  CHANNEL_ID=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local channel list "${TEAM}" --json 2>/dev/null | \
    python3 -c "import sys,json; channels=json.load(sys.stdin); print(next(c['id'] for c in channels if c['name']=='${CHANNEL_NAME}'))" 2>/dev/null) || return 1

  echo "  Channel: ${CHANNEL_NAME} (${CHANNEL_ID})"

  # Create webhook
  local WEBHOOK_URL
  WEBHOOK_URL=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local webhook create-incoming \
      --channel "${TEAM}:${CHANNEL_NAME}" \
      --display-name "KORE Docs" \
      --description "Documentation integration" \
      --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null) || return 1

  echo "  Webhook created: ${WEBHOOK_URL}"

  # Update channel header
  kubectl exec -n "${NAMESPACE}" deploy/mattermost -- curl -s --unix-socket /var/tmp/mattermost_local.socket \
    -X PUT "http://localhost:8065/api/v4/channels/${CHANNEL_ID}/patch" \
    -H 'Content-Type: application/json' \
    -d "{\"header\": \"${HEADER_MSG}\"}" > /dev/null
  echo "  Channel header updated."

  # Post via webhook
  kubectl exec -n "${NAMESPACE}" deploy/mattermost -- curl -s -X POST "http://localhost:8065/hooks/${WEBHOOK_URL}" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"${DOCS_MSG}\"}" > /dev/null

  echo "  Announcement posted."
  return 0
}

# ── Method 2: API with token ──────────────────────────────────
try_api() {
  if [ -z "${MM_TOKEN}" ]; then
    echo "No MM_TOKEN provided. Skipping API method."
    return 1
  fi

  echo "Using Mattermost API with token..."

  mm_api() {
    local method="$1" endpoint="$2"
    shift 2
    curl -s -X "${method}" "${MM_URL}/api/v4${endpoint}" \
      -H "Authorization: Bearer ${MM_TOKEN}" \
      -H 'Content-Type: application/json' \
      "$@"
  }

  # Get team
  local TEAM_ID
  if [ -n "${TEAM_NAME}" ]; then
    TEAM_ID=$(mm_api GET "/teams/name/${TEAM_NAME}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
  else
    TEAM_ID=$(mm_api GET "/teams" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
  fi

  if [ -z "${TEAM_ID}" ]; then
    echo "ERROR: Could not find team."
    return 1
  fi
  echo "  Team ID: ${TEAM_ID}"

  # Get target channel
  local CHANNEL_ID
  CHANNEL_ID=$(mm_api GET "/teams/${TEAM_ID}/channels/name/${CHANNEL_NAME}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
  echo "  Channel ID: ${CHANNEL_ID}"

  # Update channel header with docs link
  mm_api PUT "/channels/${CHANNEL_ID}" \
    -d "{\"id\": \"${CHANNEL_ID}\", \"header\": \"${HEADER_MSG}\"}" > /dev/null
  echo "  Channel header updated."

  # Post announcement
  mm_api POST "/posts" \
    -d "{\"channel_id\": \"${CHANNEL_ID}\", \"message\": \"$(echo -e "${DOCS_MSG}")\"}" > /dev/null
  echo "  Announcement posted."
  return 0
}

# ── Run ───────────────────────────────────────────────────────
if try_mmctl 2>/dev/null; then
  echo ""
  echo "=== Integration complete (via mmctl) ==="
elif try_api; then
  echo ""
  echo "=== Integration complete (via API) ==="
else
  echo ""
  echo "=== Automatic integration failed ==="
  echo ""
  echo "Manual setup instructions:"
  echo ""
  echo "1. Open Mattermost: ${MM_URL}"
  echo "2. Go to any channel > Channel Header > click Edit"
  echo "3. Add this to the header:"
  echo "   [KORE Docs](${DOCS_URL})"
  echo ""
  echo "4. Optional: Create a slash command"
  echo "   System Console > Integrations > Slash Commands > Add"
  echo "   - Title:   KORE Docs"
  echo "   - Trigger:  docs"
  echo "   - URL:     ${DOCS_URL}"
  echo "   - Method:  GET"
  echo ""
  echo "5. Optional: Add as a channel bookmark"
  echo "   Click the bookmark icon in any channel header"
  echo "   - Label: KORE Docs"
  echo "   - URL:   ${DOCS_URL}"
  echo ""
  echo "To use the API method, create a personal access token:"
  echo "  Mattermost > Profile > Security > Personal Access Tokens"
  echo "  Then re-run: MM_TOKEN=<token> bash $0"
fi

echo ""
echo "  Docs URL: ${DOCS_URL}"
