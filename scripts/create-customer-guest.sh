#!/usr/bin/env bash
# create-customer-guest.sh
# FA-11: Erstellt einen Kunden-Gast-Account in Keycloak + Mattermost.
#
# Ablauf:
#   1. Keycloak: Nutzer anlegen (temporäres Passwort, muss bei erstem Login geändert werden)
#   2. Mattermost: Gast-Account anlegen (role: system_guest)
#   3. Mattermost: Dedizierter Kunden-Kanal anlegen (z.B. "kunde-mustermann")
#   4. Mattermost: Gast dem Kanal hinzufügen (Gast sieht NUR diesen Kanal)
#   5. Ausgabe: Login-URL + temporäres Passwort für den Admin
#
# Usage:
#   bash scripts/create-customer-guest.sh \
#     --name "Max Mustermann" \
#     --email "max@example.com" \
#     --team "main-team"
#
# Voraussetzungen:
#   - MM_TOKEN: Mattermost Admin Personal Access Token
#   - KC_ADMIN_USER / KC_ADMIN_PASS: Keycloak Admin-Zugangsdaten
#   - MM_URL, KC_URL: Dienst-URLs (default: auto-detect)
#
# Umgebungsvariablen:
#   MM_TOKEN        - Mattermost Admin-Token (Pflicht)
#   KC_ADMIN_USER   - Keycloak Admin-Nutzer (default: admin)
#   KC_ADMIN_PASS   - Keycloak Admin-Passwort (default: aus secrets.yaml)
#   MM_URL          - Mattermost URL
#   KC_URL          - Keycloak Base URL
#   KC_REALM        - Keycloak Realm (default: workspace)
#   NAMESPACE       - Kubernetes Namespace (default: workspace)
#   DRY_RUN         - Wenn "true": Aktionen nur anzeigen, nicht ausführen

set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
MM_URL="${MM_URL:-}"
KC_URL="${KC_URL:-}"
KC_REALM="${KC_REALM:-workspace}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASS="${KC_ADMIN_PASS:-}"
MM_TOKEN="${MM_TOKEN:-}"
DRY_RUN="${DRY_RUN:-false}"

CUSTOMER_NAME=""
CUSTOMER_EMAIL=""
TEAM_NAME=""

# ── Argumente parsen ──────────────────────────────────────────
usage() {
  echo "Usage: $0 --name <Name> --email <E-Mail> --team <Mattermost-Team>"
  echo ""
  echo "Beispiel:"
  echo "  MM_TOKEN=xxx bash $0 --name 'Max Mustermann' --email 'max@example.com' --team 'main-team'"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)   CUSTOMER_NAME="$2";  shift 2 ;;
    --email)  CUSTOMER_EMAIL="$2"; shift 2 ;;
    --team)   TEAM_NAME="$2";      shift 2 ;;
    --dry-run) DRY_RUN="true";     shift ;;
    *) usage ;;
  esac
done

[ -z "${CUSTOMER_NAME}"  ] && usage
[ -z "${CUSTOMER_EMAIL}" ] && usage
[ -z "${TEAM_NAME}"      ] && usage
[ -z "${MM_TOKEN}"       ] && { echo "FEHLER: MM_TOKEN nicht gesetzt."; exit 1; }

# ── Derived values ────────────────────────────────────────────
# Username: lowercase, spaces → dots, remove special chars
CUSTOMER_USERNAME=$(echo "${CUSTOMER_NAME}" | tr '[:upper:]' '[:lower:]' | tr ' ' '.' | tr -cd '[:alnum:].')
# Channel name: "kunde-" prefix + lowercase username
CHANNEL_NAME="kunde-${CUSTOMER_USERNAME}"
CHANNEL_DISPLAY="Kunde: ${CUSTOMER_NAME}"
# Temporary password: random 16-char string
TEMP_PASSWORD="Temp$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 12)!"

echo "=== Kunden-Gast erstellen ==="
echo "  Name:     ${CUSTOMER_NAME}"
echo "  E-Mail:   ${CUSTOMER_EMAIL}"
echo "  Username: ${CUSTOMER_USERNAME}"
echo "  Team:     ${TEAM_NAME}"
echo "  Kanal:    ${CHANNEL_NAME}"
[ "${DRY_RUN}" = "true" ] && echo "  [DRY RUN — keine Änderungen]"
echo ""

# ── Auto-detect URLs ──────────────────────────────────────────
if [ -z "${MM_URL}" ]; then
  MM_URL=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
fi

if [ -z "${KC_URL}" ]; then
  KC_DOMAIN=$(kubectl get configmap domain-config -n "${NAMESPACE}" \
    -o jsonpath='{.data.KC_DOMAIN}' 2>/dev/null || echo "auth.localhost")
  KC_URL="http://${KC_DOMAIN}"
fi

if [ -z "${KC_ADMIN_PASS}" ]; then
  KC_ADMIN_PASS=$(kubectl get secret workspace-secrets -n "${NAMESPACE}" \
    -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null | base64 -d || echo "")
  [ -z "${KC_ADMIN_PASS}" ] && { echo "FEHLER: KC_ADMIN_PASS nicht ermittelbar."; exit 1; }
fi

echo "  Mattermost: ${MM_URL}"
echo "  Keycloak:   ${KC_URL}/realms/${KC_REALM}"
echo ""

# ── Helper functions ──────────────────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

kc_token() {
  curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=${KC_ADMIN_USER}" \
    -d "password=${KC_ADMIN_PASS}" \
    -d "grant_type=password" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
}

kc_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${KC_URL}/admin/realms/${KC_REALM}${endpoint}" \
    -H "Authorization: Bearer ${KC_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Step 1: Keycloak — Nutzer anlegen ─────────────────────────
echo "[1/4] Keycloak: Nutzer anlegen..."

if [ "${DRY_RUN}" = "true" ]; then
  echo "  [DRY RUN] Würde Keycloak-Nutzer '${CUSTOMER_USERNAME}' anlegen."
else
  KC_TOKEN=$(kc_token)

  # Check if user already exists
  EXISTING=$(kc_api GET "/users?username=${CUSTOMER_USERNAME}" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null || echo "")

  if [ -n "${EXISTING}" ]; then
    echo "  Nutzer '${CUSTOMER_USERNAME}' existiert bereits in Keycloak (${EXISTING})."
    KC_USER_ID="${EXISTING}"
  else
    kc_api POST "/users" \
      -d "{
        \"username\": \"${CUSTOMER_USERNAME}\",
        \"email\": \"${CUSTOMER_EMAIL}\",
        \"firstName\": \"$(echo "${CUSTOMER_NAME}" | awk '{print $1}')\",
        \"lastName\": \"$(echo "${CUSTOMER_NAME}" | cut -d' ' -f2-)\",
        \"enabled\": true,
        \"emailVerified\": true,
        \"credentials\": [{
          \"type\": \"password\",
          \"value\": \"${TEMP_PASSWORD}\",
          \"temporary\": true
        }]
      }" > /dev/null

    KC_USER_ID=$(kc_api GET "/users?username=${CUSTOMER_USERNAME}" | \
      python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
    echo "  Nutzer '${CUSTOMER_USERNAME}' angelegt (${KC_USER_ID})."
  fi
fi
echo ""

# ── Step 2: Mattermost — Gast-Account anlegen ─────────────────
echo "[2/4] Mattermost: Gast-Account anlegen..."

if [ "${DRY_RUN}" = "true" ]; then
  echo "  [DRY RUN] Würde Mattermost-Gast '${CUSTOMER_EMAIL}' anlegen."
  MM_USER_ID="dry-run-user-id"
else
  # Check if Mattermost user already exists
  EXISTING_MM=$(mm_api GET "/users/email/${CUSTOMER_EMAIL}" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

  if [ -n "${EXISTING_MM}" ]; then
    echo "  Mattermost-Nutzer '${CUSTOMER_EMAIL}' existiert bereits (${EXISTING_MM})."
    MM_USER_ID="${EXISTING_MM}"
  else
    MM_USER_DATA=$(mm_api POST "/users" \
      -d "{
        \"email\": \"${CUSTOMER_EMAIL}\",
        \"username\": \"${CUSTOMER_USERNAME}\",
        \"first_name\": \"$(echo "${CUSTOMER_NAME}" | awk '{print $1}')\",
        \"last_name\": \"$(echo "${CUSTOMER_NAME}" | cut -d' ' -f2-)\",
        \"password\": \"${TEMP_PASSWORD}\",
        \"roles\": \"system_guest\"
      }")
    MM_USER_ID=$(echo "${MM_USER_DATA}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    echo "  Gast-Account angelegt (${MM_USER_ID})."
  fi

  # Ensure guest role is set
  mm_api PUT "/users/${MM_USER_ID}/roles" \
    -d "{\"roles\": \"system_guest\"}" > /dev/null
  echo "  Rolle 'system_guest' gesetzt."
fi
echo ""

# ── Step 3: Mattermost — Kunden-Kanal anlegen ─────────────────
echo "[3/4] Mattermost: Kunden-Kanal '${CHANNEL_NAME}' anlegen..."

if [ "${DRY_RUN}" = "true" ]; then
  echo "  [DRY RUN] Würde Kanal '${CHANNEL_NAME}' im Team '${TEAM_NAME}' anlegen."
  MM_CHANNEL_ID="dry-run-channel-id"
else
  TEAM_DATA=$(mm_api GET "/teams/name/${TEAM_NAME}" 2>/dev/null || echo "{}")
  TEAM_ID=$(echo "${TEAM_DATA}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

  if [ -z "${TEAM_ID}" ]; then
    echo "FEHLER: Team '${TEAM_NAME}' nicht gefunden. Verfügbare Teams:"
    mm_api GET "/teams" | python3 -c "import sys,json; [print('  -', t['name']) for t in json.load(sys.stdin)]"
    exit 1
  fi

  # Check if channel already exists
  EXISTING_CH=$(mm_api GET "/teams/${TEAM_ID}/channels/name/${CHANNEL_NAME}" 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

  if [ -n "${EXISTING_CH}" ]; then
    echo "  Kanal '${CHANNEL_NAME}' existiert bereits (${EXISTING_CH})."
    MM_CHANNEL_ID="${EXISTING_CH}"
  else
    CH_DATA=$(mm_api POST "/channels" \
      -d "{
        \"team_id\": \"${TEAM_ID}\",
        \"name\": \"${CHANNEL_NAME}\",
        \"display_name\": \"${CHANNEL_DISPLAY}\",
        \"purpose\": \"Kunden-Kommunikationskanal für ${CUSTOMER_NAME}\",
        \"type\": \"P\"
      }")
    MM_CHANNEL_ID=$(echo "${CH_DATA}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    echo "  Kanal '${CHANNEL_NAME}' erstellt (${MM_CHANNEL_ID})."
  fi

  # ── Step 4: Gast dem Kanal hinzufügen ──────────────────────
  echo ""
  echo "[4/4] Mattermost: Gast dem Kunden-Kanal hinzufügen..."

  mm_api POST "/channels/${MM_CHANNEL_ID}/members" \
    -d "{\"user_id\": \"${MM_USER_ID}\"}" > /dev/null
  echo "  '${CUSTOMER_USERNAME}' zum Kanal '${CHANNEL_NAME}' hinzugefügt."
fi

# ── Zusammenfassung ───────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  Kunden-Gast erfolgreich eingerichtet"
echo "══════════════════════════════════════════════════════"
echo ""
echo "  Kunde:          ${CUSTOMER_NAME}"
echo "  E-Mail:         ${CUSTOMER_EMAIL}"
echo "  Mattermost URL: ${MM_URL}"
echo "  Login:          ${CUSTOMER_USERNAME}"
echo "  Temp. Passwort: ${TEMP_PASSWORD}"
echo "    (Muss beim ersten Login geändert werden)"
echo ""
echo "  Kunden-Kanal:   ${CHANNEL_DISPLAY} (#${CHANNEL_NAME})"
echo ""
echo "Nächste Schritte für den Admin:"
echo "  1. Dem Kunden die Login-URL und das Temp.-Passwort mitteilen."
echo "  2. Im Kunden-Kanal Nachrichten, Dateien und Rechnungen bereitstellen."
echo "  3. Zum Deaktivieren: Nutzer in Keycloak deaktivieren:"
echo "     ${KC_URL}/admin/realms/${KC_REALM}/users"
echo ""
[ "${DRY_RUN}" = "true" ] && echo "  [DRY RUN — keine Änderungen wurden vorgenommen]"
