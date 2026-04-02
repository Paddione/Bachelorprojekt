#!/usr/bin/env bash
# mattermost-wordpress-setup.sh
# Creates a "wordpress" channel in Mattermost that:
#   1. Shows the external WordPress site URL and login link in the channel header
#   2. Creates an incoming webhook to receive form submissions and actions from WordPress
#
# The webhook URL printed at the end can be used in WordPress for:
#   - CF7 to Webhook (cf7-to-zapier) plugin
#   - WooCommerce webhook actions
#   - Custom plugin notifications
#   - Any REST/webhook-based integration
#
# Usage:
#   bash scripts/mattermost-wordpress-setup.sh                    # auto-detect
#   MM_TOKEN=<token> bash scripts/mattermost-wordpress-setup.sh   # use API token
#
# Environment variables:
#   MM_URL       - Mattermost URL (default: auto-detect from SiteURL)
#   MM_TOKEN     - Personal access token (skip mmctl, use REST API)
#   NAMESPACE    - Kubernetes namespace (default: homeoffice)
#   WP_EXTERNAL  - External WordPress URL (default: auto-detect from IngressRoute)
#   CHANNEL_NAME - Channel name (default: wordpress)

set -euo pipefail

NAMESPACE="${NAMESPACE:-homeoffice}"
MM_URL="${MM_URL:-}"
MM_TOKEN="${MM_TOKEN:-}"
WP_EXTERNAL="${WP_EXTERNAL:-}"
CHANNEL_NAME="${CHANNEL_NAME:-wordpress}"
CHANNEL_DISPLAY="WordPress"
CHANNEL_PURPOSE="WordPress-Website: Externe Links, Formulareingänge und Aktionen"

echo "=== Mattermost WordPress-Kanal Setup ==="
echo ""

# ── Auto-detect Mattermost URL ────────────────────────────────
if [ -z "${MM_URL}" ]; then
  MM_URL=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
fi

# ── Auto-detect WordPress external URL ────────────────────────
if [ -z "${WP_EXTERNAL}" ]; then
  # Try the IngressRoute host first (production domain)
  # The match field looks like: Host(`web.wbhprojekt.ipv64.de`)
  # Extract the hostname between the backticks using sed (backticks break grep -oP in bash)
  WP_HOST=$(kubectl get ingressroute -n wordpress wordpress \
    -o jsonpath='{.spec.routes[0].match}' 2>/dev/null \
    | sed -n 's/.*`\([^`]*\)`.*/\1/p' || echo "")
  if [ -n "${WP_HOST}" ]; then
    WP_EXTERNAL="https://${WP_HOST}"
  else
    # Fall back to domain-config ConfigMap
    WP_DOMAIN=$(kubectl get configmap domain-config -n "${NAMESPACE}" \
      -o jsonpath='{.data.WP_DOMAIN}' 2>/dev/null || echo "web.localhost")
    WP_EXTERNAL="http://${WP_DOMAIN}"
  fi
fi

WP_LOGIN="${WP_EXTERNAL}/wp-login.php"
WP_ADMIN="${WP_EXTERNAL}/wp-admin/"

echo "  Mattermost: ${MM_URL}"
echo "  WordPress:  ${WP_EXTERNAL}"
echo "  Login:      ${WP_LOGIN}"
echo "  Kanal:      ${CHANNEL_NAME} (${CHANNEL_DISPLAY})"
echo ""

# ── Build messages ───────────────────────────────────────────
HEADER_MSG=":globe_with_meridians: [Website](${WP_EXTERNAL}) | :lock: [Login](${WP_LOGIN}) | :gear: [Admin](${WP_ADMIN}) | WordPress-Aktionen & Formulare"

ANNOUNCE_MSG="### :globe_with_meridians: WordPress-Kanal\n\nDieser Kanal zeigt eingehende Formulareingänge und Aktionen der WordPress-Website.\n\n| Link | URL |\n|------|-----|\n| **Website** | ${WP_EXTERNAL} |\n| **Login (SSO)** | ${WP_LOGIN} |\n| **Admin-Dashboard** | ${WP_ADMIN} |\n\n**Eingehende Daten:**\n- Kontaktformulare (CF7 → Webhook)\n- Plugin-Benachrichtigungen\n- Benutzerdefinierte WordPress-Aktionen\n\nWebhook-URL ist in den Kanal-Details hinterlegt."

# ── Helper: REST API call ────────────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Method 1: mmctl inside pod ───────────────────────────────
setup_via_mmctl() {
  echo "Methode: mmctl (local mode, innerhalb des Pods)"

  local TEAMS_JSON
  TEAMS_JSON=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local team list --json 2>/dev/null)

  local TEAM_NAMES
  TEAM_NAMES=$(echo "${TEAMS_JSON}" | \
    python3 -c "import sys,json; [print(t['name']) for t in json.load(sys.stdin)]")

  if [ -z "${TEAM_NAMES}" ]; then
    echo "  Keine Teams gefunden."
    return 1
  fi

  while IFS= read -r TEAM; do
    echo ""
    echo "  Team: ${TEAM}"

    # Check if channel exists
    local CHANNEL_EXISTS
    CHANNEL_EXISTS=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local channel list "${TEAM}" --json 2>/dev/null | \
      python3 -c "
import sys,json
channels = json.load(sys.stdin)
found = [c for c in channels if c.get('name') == '${CHANNEL_NAME}']
print('yes' if found else 'no')
" 2>/dev/null || echo "no")

    if [ "${CHANNEL_EXISTS}" = "no" ]; then
      kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
        mmctl --local channel create \
          --team "${TEAM}" \
          --name "${CHANNEL_NAME}" \
          --display-name "${CHANNEL_DISPLAY}" \
          --purpose "${CHANNEL_PURPOSE}" \
          2>/dev/null
      echo "    Kanal '${CHANNEL_NAME}' erstellt."
    else
      echo "    Kanal '${CHANNEL_NAME}' existiert bereits."
    fi

    # Get channel ID for header update
    local CHANNEL_ID
    CHANNEL_ID=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local channel list "${TEAM}" --json 2>/dev/null | \
      python3 -c "
import sys,json
channels = json.load(sys.stdin)
ch = next(c for c in channels if c['name'] == '${CHANNEL_NAME}')
print(ch['id'])
" 2>/dev/null) || true

    # Add all team members so the channel appears in everyone's sidebar
    local ALL_USERS
    ALL_USERS=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local user list --json 2>/dev/null | \
      python3 -c "
import sys,json
users = json.load(sys.stdin)
print(' '.join(u['username'] for u in users if u.get('delete_at',0) == 0))
" 2>/dev/null) || true

    if [ -n "${ALL_USERS}" ]; then
      kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
        mmctl --local channel users add "${TEAM}:${CHANNEL_NAME}" ${ALL_USERS} 2>/dev/null || true
      echo "    Alle Team-Mitglieder hinzugefügt."
    fi

    # Update channel header with links
    if [ -n "${CHANNEL_ID}" ]; then
      kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
        curl -s --unix-socket /var/tmp/mattermost_local.socket \
          -X PUT "http://localhost:8065/api/v4/channels/${CHANNEL_ID}/patch" \
          -H 'Content-Type: application/json' \
          -d "{\"header\": \"${HEADER_MSG}\"}" > /dev/null
      echo "    Header aktualisiert."
    fi

    # Get a system_admin user ID as webhook owner
    local ADMIN_ID
    ADMIN_ID=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local user list --json 2>/dev/null | \
      python3 -c "
import sys,json
users = json.load(sys.stdin)
admin = next((u['id'] for u in users if 'system_admin' in u.get('roles','')), users[0]['id'])
print(admin)
" 2>/dev/null) || true

    # Create incoming webhook for WordPress forms/actions
    # mmctl requires --channel <channelID> and --user <userID>
    local WEBHOOK_ID
    if [ -n "${CHANNEL_ID}" ] && [ -n "${ADMIN_ID}" ]; then
      WEBHOOK_ID=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
        mmctl --local webhook create-incoming \
          --channel "${CHANNEL_ID}" \
          --user "${ADMIN_ID}" \
          --display-name "WordPress (${TEAM})" \
          --description "Eingehende Formulare und Aktionen von WordPress" \
          --json 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'] if isinstance(d,dict) else d[0]['id'])" 2>/dev/null) || true
    fi

    if [ -n "${WEBHOOK_ID}" ]; then
      local WEBHOOK_URL="${MM_URL}/hooks/${WEBHOOK_ID}"
      echo "    Webhook erstellt: ${WEBHOOK_URL}"
    else
      echo "    WARNUNG: Webhook konnte nicht erstellt werden — ggf. bereits vorhanden."
    fi

    # Post announcement
    if [ -n "${WEBHOOK_ID}" ]; then
      kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
        curl -s -X POST "http://localhost:8065/hooks/${WEBHOOK_ID}" \
          -H 'Content-Type: application/json' \
          -d "{\"text\": \"${ANNOUNCE_MSG}\"}" > /dev/null
      echo "    Ankündigung gepostet."
    fi

  done <<< "${TEAM_NAMES}"

  return 0
}

# ── Method 2: REST API with token ────────────────────────────
setup_via_api() {
  if [ -z "${MM_TOKEN}" ]; then
    echo "Kein MM_TOKEN gesetzt — API-Methode übersprungen."
    return 1
  fi

  echo "Methode: REST API mit Token"

  local TEAMS_JSON
  TEAMS_JSON=$(mm_api GET "/teams")
  local TEAM_COUNT
  TEAM_COUNT=$(echo "${TEAMS_JSON}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  echo "  ${TEAM_COUNT} Team(s) gefunden."

  local TEAM_NAMES TEAM_IDS
  TEAM_NAMES=$(echo "${TEAMS_JSON}" | python3 -c "import sys,json; [print(t['name']) for t in json.load(sys.stdin)]")
  TEAM_IDS=$(echo "${TEAMS_JSON}"   | python3 -c "import sys,json; [print(t['id'])   for t in json.load(sys.stdin)]")

  local i=0
  while IFS= read -r TEAM; do
    local TEAM_ID
    TEAM_ID=$(echo "${TEAM_IDS}" | sed -n "$((i+1))p")
    i=$((i+1))

    echo ""
    echo "  Team: ${TEAM} (${TEAM_ID})"

    # Check / create channel
    local CHANNEL_DATA
    CHANNEL_DATA=$(mm_api GET "/teams/${TEAM_ID}/channels/name/${CHANNEL_NAME}" 2>/dev/null || echo "{}")
    local CHANNEL_ID
    CHANNEL_ID=$(echo "${CHANNEL_DATA}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [ -z "${CHANNEL_ID}" ]; then
      CHANNEL_DATA=$(mm_api POST "/channels" \
        -d "{
          \"team_id\": \"${TEAM_ID}\",
          \"name\": \"${CHANNEL_NAME}\",
          \"display_name\": \"${CHANNEL_DISPLAY}\",
          \"purpose\": \"${CHANNEL_PURPOSE}\",
          \"type\": \"O\"
        }")
      CHANNEL_ID=$(echo "${CHANNEL_DATA}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
      echo "    Kanal '${CHANNEL_NAME}' erstellt (${CHANNEL_ID})."
    else
      echo "    Kanal '${CHANNEL_NAME}' existiert bereits (${CHANNEL_ID})."
    fi

    # Add all team members so the channel appears in everyone's sidebar
    local MEMBERS_JSON
    MEMBERS_JSON=$(mm_api GET "/teams/${TEAM_ID}/members?per_page=200" 2>/dev/null || echo "[]")
    local MEMBER_IDS
    MEMBER_IDS=$(echo "${MEMBERS_JSON}" | python3 -c "
import sys,json
members = json.load(sys.stdin)
if isinstance(members, list):
    [print(m['user_id']) for m in members]
" 2>/dev/null) || true

    local ADDED=0
    while IFS= read -r USER_ID; do
      [ -z "${USER_ID}" ] && continue
      mm_api POST "/channels/${CHANNEL_ID}/members" \
        -d "{\"user_id\": \"${USER_ID}\"}" > /dev/null 2>&1 || true
      ADDED=$((ADDED + 1))
    done <<< "${MEMBER_IDS}"
    echo "    ${ADDED} Team-Mitglieder hinzugefügt."

    # Update channel header with WordPress links
    mm_api PUT "/channels/${CHANNEL_ID}" \
      -d "{\"id\": \"${CHANNEL_ID}\", \"header\": \"${HEADER_MSG}\"}" > /dev/null
    echo "    Header aktualisiert."

    # Create incoming webhook
    local WEBHOOK_DATA
    WEBHOOK_DATA=$(mm_api POST "/hooks/incoming" \
      -d "{
        \"channel_id\": \"${CHANNEL_ID}\",
        \"display_name\": \"WordPress (${TEAM})\",
        \"description\": \"Eingehende Formulare und Aktionen von WordPress\"
      }")
    local WEBHOOK_ID
    WEBHOOK_ID=$(echo "${WEBHOOK_DATA}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    local WEBHOOK_URL="${MM_URL}/hooks/${WEBHOOK_ID}"
    echo "    Webhook erstellt: ${WEBHOOK_URL}"

    # Post announcement
    mm_api POST "/posts" \
      -d "{\"channel_id\": \"${CHANNEL_ID}\", \"message\": \"$(echo -e "${ANNOUNCE_MSG}")\"}" > /dev/null
    echo "    Ankündigung gepostet."

  done <<< "${TEAM_NAMES}"

  return 0
}

# ── Run ──────────────────────────────────────────────────────
if [ -z "${MM_TOKEN}" ]; then
  setup_via_mmctl 2>/dev/null || setup_via_api || {
    echo ""
    echo "=== Automatisches Setup fehlgeschlagen ==="
    echo ""
    echo "Manuell in Mattermost:"
    echo "  1. Kanal '${CHANNEL_NAME}' erstellen"
    echo "  2. Header setzen:"
    echo "     ${HEADER_MSG}"
    echo "  3. System Console > Integrationen > Eingehende Webhooks"
    echo "     → Webhook erstellen, Zielkanal: '${CHANNEL_DISPLAY}'"
    echo "  4. Webhook-URL in WordPress eintragen:"
    echo "     WordPress Admin > CF7 to Webhook > Webhook URL"
    echo ""
    echo "  WordPress-Links:"
    echo "    Website: ${WP_EXTERNAL}"
    echo "    Login:   ${WP_LOGIN}"
    echo "    Admin:   ${WP_ADMIN}"
    exit 1
  }
else
  setup_via_api || setup_via_mmctl 2>/dev/null || exit 1
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "WordPress-Links:"
echo "  Website:         ${WP_EXTERNAL}"
echo "  Login (SSO):     ${WP_LOGIN}"
echo "  Admin-Dashboard: ${WP_ADMIN}"
echo ""
echo "Webhook-URL in WordPress eintragen unter:"
echo "  CF7 to Webhook:  WordPress Admin > CF7 to Webhook > Webhook URL"
echo "  WooCommerce:     Einstellungen > Erweitert > Webhooks > Hinzufügen"
echo "  Custom Plugins:  Die Webhook-URL als Ziel-Endpunkt verwenden"
echo ""
echo "Tipp: Dieser Kanal empfängt alle WordPress-Formulare und -Aktionen."
echo "      Für team-spezifische Kontaktanfragen siehe den 'anfragen'-Kanal."
