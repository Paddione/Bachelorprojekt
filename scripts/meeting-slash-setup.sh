#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# meeting-slash-setup.sh
# Registers the /meeting slash command in Mattermost.
# Creates the command in every team, pointing to the website API.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
WEBSITE_URL="${WEBSITE_URL:-http://website.website.svc.cluster.local:4321}"

echo "=== /meeting Slash-Command Setup ==="

# Generate token
ADMIN_USER_ID=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
  mmctl --local user list --json 2>/dev/null | \
  python3 -c "
import sys,json
users = json.load(sys.stdin) or []
admins = [u for u in users if 'system_admin' in u.get('roles','')]
if admins: print(admins[0]['id'])
" 2>/dev/null)

MM_TOKEN=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
  mmctl --local token generate "${ADMIN_USER_ID}" "meeting-slash-$(date +%s)" 2>/dev/null | \
  grep -oP '^[a-z0-9]{26}' | head -1)

# Use internal cluster URL for API calls (SiteURL may be external/unreachable from host)
MM_URL="${MM_URL:-}"
if [ -z "${MM_URL}" ]; then
  # Port-forward mattermost for API access
  kubectl port-forward -n "${NAMESPACE}" svc/mattermost 19065:8065 > /dev/null 2>&1 &
  PF_PID=$!
  sleep 2
  MM_URL="http://localhost:19065"
  CLEANUP_PF="true"
fi

mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# Get all teams
TEAMS=$(mm_api GET "/teams")
echo "${TEAMS}" | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(t['id'], t['name'])
" | while read -r TEAM_ID TEAM_NAME; do
  echo ""
  echo "  Team: ${TEAM_NAME}"

  # Check if /meeting command already exists
  EXISTING=$(mm_api GET "/teams/${TEAM_ID}/commands" 2>/dev/null | python3 -c "
import sys,json
cmds = json.load(sys.stdin) or []
for c in cmds:
    if c.get('trigger') == 'meeting':
        print(c['id'])
        break
" 2>/dev/null || echo "")

  if [ -n "${EXISTING}" ]; then
    echo "    /meeting existiert bereits (${EXISTING}) — aktualisiere..."
    mm_api PUT "/commands/${EXISTING}" -d "{
      \"id\": \"${EXISTING}\",
      \"team_id\": \"${TEAM_ID}\",
      \"trigger\": \"meeting\",
      \"method\": \"P\",
      \"url\": \"${WEBSITE_URL}/api/mattermost/slash/meeting\",
      \"display_name\": \"Ad-Hoc Meeting\",
      \"description\": \"Startet ein Ad-Hoc Meeting mit Pipeline-Integration\",
      \"auto_complete\": true,
      \"auto_complete_hint\": \"[Name] [Email] [Typ]\",
      \"auto_complete_desc\": \"Meeting starten: /meeting Max Mustermann max@example.de Coaching\"
    }" > /dev/null 2>&1 && echo "    Aktualisiert." || echo "    Fehler beim Aktualisieren."
  else
    mm_api POST "/commands" -d "{
      \"team_id\": \"${TEAM_ID}\",
      \"trigger\": \"meeting\",
      \"method\": \"P\",
      \"url\": \"${WEBSITE_URL}/api/mattermost/slash/meeting\",
      \"display_name\": \"Ad-Hoc Meeting\",
      \"description\": \"Startet ein Ad-Hoc Meeting mit Pipeline-Integration\",
      \"auto_complete\": true,
      \"auto_complete_hint\": \"[Name] [Email] [Typ]\",
      \"auto_complete_desc\": \"Meeting starten: /meeting Max Mustermann max@example.de Coaching\",
      \"creator_id\": \"${ADMIN_USER_ID}\"
    }" > /dev/null 2>&1 && echo "    /meeting erstellt." || echo "    Fehler beim Erstellen."
  fi
done

# Cleanup token
TOKEN_ID=$(mm_api GET "/users/me/tokens" 2>/dev/null | python3 -c "
import sys,json
for t in (json.load(sys.stdin) or []):
    if 'meeting-slash' in t.get('description',''):
        print(t['id']); break
" 2>/dev/null || echo "")
if [ -n "${TOKEN_ID}" ]; then
  mm_api POST "/users/tokens/revoke" -d "{\"token_id\": \"${TOKEN_ID}\"}" > /dev/null 2>&1
fi

# Cleanup port-forward
if [ "${CLEANUP_PF:-}" = "true" ]; then
  kill $PF_PID 2>/dev/null || true
fi

echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "Verwendung in Mattermost:"
echo "  /meeting Max Mustermann max@example.de Coaching"
echo "  /meeting Lisa lisa@test.de"
echo "  /meeting                                  (schnelles Meeting ohne Kunde)"
