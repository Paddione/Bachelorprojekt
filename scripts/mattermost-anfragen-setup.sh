#!/usr/bin/env bash
# mattermost-anfragen-setup.sh
# Creates an "anfragen" channel and an incoming webhook in every Mattermost team.
# The webhook URLs are printed at the end — copy them into WordPress:
#   WordPress Admin > CF7 to Webhook > Webhook URL
#
# Usage:
#   bash scripts/mattermost-anfragen-setup.sh              # auto-detect via mmctl
#   MM_TOKEN=<token> bash scripts/mattermost-anfragen-setup.sh  # use API token
#
# Environment variables:
#   MM_URL       - Mattermost URL (default: auto-detect)
#   MM_TOKEN     - Personal access token (skip mmctl, use REST API)
#   NAMESPACE    - Kubernetes namespace (default: workspace)
#   CHANNEL_NAME - Channel name to create per team (default: anfragen)

set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
MM_URL="${MM_URL:-}"
MM_TOKEN="${MM_TOKEN:-}"
CHANNEL_NAME="${CHANNEL_NAME:-anfragen}"
CHANNEL_DISPLAY="Anfragen"
CHANNEL_PURPOSE="Eingehende Kundenanfragen vom Kontaktformular der WordPress-Website"

declare -A WEBHOOK_URLS  # team_name -> webhook_url

echo "=== Mattermost Anfragen-Kanal Setup ==="
echo ""

# ── Auto-detect Mattermost URL ────────────────────────────────
if [ -z "${MM_URL}" ]; then
  MM_URL=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
fi
echo "  Mattermost: ${MM_URL}"
echo "  Kanal:      ${CHANNEL_NAME} (${CHANNEL_DISPLAY})"
echo ""

# ── Helper: REST API call ─────────────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Method 1: mmctl inside pod ────────────────────────────────
setup_via_mmctl() {
  echo "Methode: mmctl (local mode, innerhalb des Pods)"

  # Get all team names
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

    # Create channel if it doesn't exist
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

    # Create incoming webhook
    local WEBHOOK_ID
    WEBHOOK_ID=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local webhook create-incoming \
        --channel "${TEAM}:${CHANNEL_NAME}" \
        --display-name "Kontaktformular (${TEAM})" \
        --description "Eingehende Anfragen vom WordPress-Kontaktformular" \
        --json 2>/dev/null | \
      python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null) || true

    if [ -n "${WEBHOOK_ID}" ]; then
      local WEBHOOK_URL="${MM_URL}/hooks/${WEBHOOK_ID}"
      WEBHOOK_URLS["${TEAM}"]="${WEBHOOK_URL}"
      echo "    Webhook erstellt: ${WEBHOOK_URL}"
    else
      echo "    WARNUNG: Webhook konnte nicht erstellt werden — ggf. bereits vorhanden."
    fi

  done <<< "${TEAM_NAMES}"

  return 0
}

# ── Method 2: REST API with token ─────────────────────────────
setup_via_api() {
  if [ -z "${MM_TOKEN}" ]; then
    echo "Kein MM_TOKEN gesetzt — API-Methode übersprungen."
    return 1
  fi

  echo "Methode: REST API mit Token"

  # Get all teams
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

    # Check if channel exists
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

    # Create incoming webhook
    local WEBHOOK_DATA
    WEBHOOK_DATA=$(mm_api POST "/hooks/incoming" \
      -d "{
        \"channel_id\": \"${CHANNEL_ID}\",
        \"display_name\": \"Kontaktformular (${TEAM})\",
        \"description\": \"Eingehende Anfragen vom WordPress-Kontaktformular\"
      }")
    local WEBHOOK_ID
    WEBHOOK_ID=$(echo "${WEBHOOK_DATA}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    local WEBHOOK_URL="${MM_URL}/hooks/${WEBHOOK_ID}"
    WEBHOOK_URLS["${TEAM}"]="${WEBHOOK_URL}"
    echo "    Webhook erstellt: ${WEBHOOK_URL}"

  done <<< "${TEAM_NAMES}"

  return 0
}

# ── Run ───────────────────────────────────────────────────────
if [ -z "${MM_TOKEN}" ]; then
  setup_via_mmctl 2>/dev/null || setup_via_api || {
    echo ""
    echo "=== Automatisches Setup fehlgeschlagen ==="
    echo ""
    echo "Manuell in Mattermost:"
    echo "  1. Gehe in jedes Team → Kanal hinzufügen → Name: '${CHANNEL_NAME}'"
    echo "  2. System Console > Integrationen > Eingehende Webhooks"
    echo "     → Webhook erstellen, Zielkanal: '${CHANNEL_DISPLAY}'"
    echo "  3. Webhook-URL in WordPress eintragen:"
    echo "     WordPress Admin > CF7 to Webhook > Webhook URL"
    exit 1
  }
else
  setup_via_api || setup_via_mmctl 2>/dev/null || exit 1
fi

# ── Print summary ─────────────────────────────────────────────
echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "Webhook-URLs für WordPress (CF7 to Webhook Plugin):"
echo "──────────────────────────────────────────────────────"
for TEAM in "${!WEBHOOK_URLS[@]}"; do
  echo "  Team '${TEAM}':"
  echo "    ${WEBHOOK_URLS[$TEAM]}"
  echo ""
done
echo "Eintragen unter: WordPress Admin > CF7 to Webhook > Webhook URL"
echo ""
echo "Tipp: Für mehrere Teams verschiedene CF7-Formulare anlegen,"
echo "jedes mit der passenden Team-Webhook-URL."
