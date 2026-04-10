#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# mattermost-connectors-setup.sh
# Creates channel bookmarks and a pinned service-directory message in
# Mattermost's "Town Square" channel, linking to every workspace service.
#
# Usage:
#   bash scripts/mattermost-connectors-setup.sh              # auto-detect via mmctl
#   MM_TOKEN=<token> bash scripts/mattermost-connectors-setup.sh  # use API token
#
# Environment:
#   MM_URL       - Mattermost URL (default: auto-detect from SiteURL)
#   MM_TOKEN     - Personal access token (skip mmctl, use REST API)
#   NAMESPACE    - Kubernetes namespace (default: workspace)
#   SCHEME       - URL scheme: http or https (default: auto-detect)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
MM_URL="${MM_URL:-}"
MM_TOKEN="${MM_TOKEN:-}"
SCHEME="${SCHEME:-}"

echo "=== Mattermost Service-Konnektoren Setup ==="
echo ""

# ── Auto-detect Mattermost URL ────────────────────────────────────────────
if [ -z "${MM_URL}" ]; then
  MM_URL=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
fi

# ── Auto-detect scheme from SiteURL ──────────────────────────────────────
if [ -z "${SCHEME}" ]; then
  SCHEME=$(echo "${MM_URL}" | grep -oP '^https?' || echo "http")
fi

# ── Read domains from ConfigMap ──────────────────────────────────────────
read_domain() {
  kubectl get configmap domain-config -n "${NAMESPACE}" -o jsonpath="{.data.$1}" 2>/dev/null || echo "$2"
}

MM_DOMAIN=$(read_domain MM_DOMAIN "chat.localhost")
KC_DOMAIN=$(read_domain KC_DOMAIN "auth.localhost")
NC_DOMAIN=$(read_domain NC_DOMAIN "files.localhost")
COLLABORA_DOMAIN=$(read_domain COLLABORA_DOMAIN "office.localhost")
BILLING_DOMAIN=$(read_domain BILLING_DOMAIN "billing.localhost")
VAULT_DOMAIN=$(read_domain VAULT_DOMAIN "vault.localhost")
DOCS_DOMAIN=$(read_domain DOCS_DOMAIN "docs.localhost")
MAIL_DOMAIN=$(read_domain MAIL_DOMAIN "mail.localhost")
WEB_DOMAIN=$(read_domain WEB_DOMAIN "web.localhost")
WHITEBOARD_DOMAIN=$(read_domain WHITEBOARD_DOMAIN "board.localhost")
AI_DOMAIN=$(read_domain AI_DOMAIN "ai.localhost")

echo "  Mattermost: ${MM_URL}"
echo "  Scheme:     ${SCHEME}"
echo ""

# ── Service definitions: name|emoji|url|description ───────────────────────
SERVICES=(
  "Nextcloud|:file_folder:|${SCHEME}://${NC_DOMAIN}|Dateien, Kalender, Kontakte"
  "Collabora Office|:pencil:|${SCHEME}://${COLLABORA_DOMAIN}|Dokumente online bearbeiten"
  "Keycloak|:key:|${SCHEME}://${KC_DOMAIN}|SSO & Benutzerverwaltung"
  "Invoice Ninja|:receipt:|${SCHEME}://${BILLING_DOMAIN}|Rechnungen & Buchhaltung"
  "Vaultwarden|:lock:|${SCHEME}://${VAULT_DOMAIN}|Passwort-Manager"
  "Dokumentation|:books:|${SCHEME}://${DOCS_DOMAIN}|Projekt-Dokumentation"
  "Whiteboard|:art:|${SCHEME}://${WHITEBOARD_DOMAIN}|Whiteboard-Zusammenarbeit"
  "Mailpit|:envelope:|${SCHEME}://${MAIL_DOMAIN}|E-Mail (Entwicklung)"
  "Website|:globe_with_meridians:|${SCHEME}://${WEB_DOMAIN}|Unternehmens-Website"
  "Claude Code|:robot_face:|${SCHEME}://${AI_DOMAIN}|KI-Assistent & MCP Status"
)

# ── Helper: mmctl API via local socket ────────────────────────────────────
mm_exec() {
  kubectl exec -n "${NAMESPACE}" deploy/mattermost -- "$@" 2>/dev/null
}

mm_mmctl() {
  mm_exec mmctl --local "$@"
}

# ── Helper: REST API call ─────────────────────────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  if [ -n "${MM_TOKEN}" ]; then
    curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
      -H "Authorization: Bearer ${MM_TOKEN}" \
      -H "Content-Type: application/json" \
      "$@"
  else
    # Use mmctl local-mode via curl inside the pod
    mm_exec curl -sf -X "${method}" \
      --unix-socket /var/tmp/mattermost_local.socket \
      "http://localhost/api/v4${endpoint}" \
      -H "Content-Type: application/json" \
      "$@"
  fi
}

# ── Generate token if needed ─────────────────────────────────────────────
if [ -z "${MM_TOKEN}" ]; then
  echo "Kein MM_TOKEN gesetzt — generiere temporaeren Token via mmctl..."
  ADMIN_USER_ID=$(mm_mmctl user list --json | \
    python3 -c "
import sys,json
users = json.load(sys.stdin)
admins = [u for u in users if 'system_admin' in u.get('roles','')]
if admins:
    print(admins[0]['id'])
" 2>/dev/null) || true

  if [ -n "${ADMIN_USER_ID}" ]; then
    TOKEN_OUTPUT=$(mm_mmctl token generate "${ADMIN_USER_ID}" "connectors-setup-$(date +%s)" 2>/dev/null) || true
    MM_TOKEN=$(echo "${TOKEN_OUTPUT}" | grep -oP '^[a-z0-9]{26}' | head -1) || true
  fi

  if [ -z "${MM_TOKEN}" ]; then
    echo "  WARNUNG: Konnte keinen Token generieren. Nutze lokalen Socket."
  else
    echo "  Token generiert."
    CLEANUP_TOKEN="true"
  fi
fi

# ── Get all teams ─────────────────────────────────────────────────────────
echo ""
echo "=== Teams und Kanaele ermitteln ==="

TEAMS_JSON=$(mm_api GET "/teams")
TEAM_COUNT=$(echo "${TEAMS_JSON}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [ "${TEAM_COUNT}" = "0" ] || [ -z "${TEAM_COUNT}" ]; then
  echo "FEHLER: Keine Teams gefunden."
  exit 1
fi

echo "  ${TEAM_COUNT} Team(s) gefunden."

# ── Process each team ─────────────────────────────────────────────────────
echo "${TEAMS_JSON}" | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(t['id'], t['name'])
" | while read -r TEAM_ID TEAM_NAME; do
  echo ""
  echo "── Team: ${TEAM_NAME} ──────────────────────────────────"

  # Get "Town Square" channel (name: town-square)
  CHANNEL_JSON=$(mm_api GET "/teams/${TEAM_ID}/channels/name/town-square")
  CHANNEL_ID=$(echo "${CHANNEL_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

  if [ -z "${CHANNEL_ID}" ]; then
    echo "  FEHLER: Town Square nicht gefunden in Team ${TEAM_NAME}"
    continue
  fi
  echo "  Town Square: ${CHANNEL_ID}"

  # ── Create/update channel bookmarks ──────────────────────────────────
  echo "  Erstelle Bookmarks..."

  # Get existing bookmarks
  EXISTING_BOOKMARKS=$(mm_api GET "/channels/${CHANNEL_ID}/bookmarks" 2>/dev/null || echo "[]")

  SORT_ORDER=0
  for SERVICE_DEF in "${SERVICES[@]}"; do
    IFS='|' read -r SVC_NAME SVC_EMOJI SVC_URL SVC_DESC <<< "${SERVICE_DEF}"
    SORT_ORDER=$((SORT_ORDER + 10))

    DISPLAY_NAME="${SVC_EMOJI} ${SVC_NAME}"

    # Check if bookmark already exists (by URL)
    BOOKMARK_EXISTS=$(echo "${EXISTING_BOOKMARKS}" | python3 -c "
import sys,json
bookmarks = json.load(sys.stdin)
for b in bookmarks:
    if b.get('link_url','') == '${SVC_URL}':
        print(b['id'])
        break
" 2>/dev/null || echo "")

    if [ -n "${BOOKMARK_EXISTS}" ]; then
      # Update existing bookmark
      mm_api PUT "/channels/${CHANNEL_ID}/bookmarks/${BOOKMARK_EXISTS}" \
        -d "{
          \"display_name\": \"${DISPLAY_NAME}\",
          \"link_url\": \"${SVC_URL}\",
          \"sort_order\": ${SORT_ORDER}
        }" > /dev/null 2>&1 && echo "    Aktualisiert: ${SVC_NAME}" || echo "    Uebersprungen: ${SVC_NAME}"
    else
      # Create new bookmark
      mm_api POST "/channels/${CHANNEL_ID}/bookmarks" \
        -d "{
          \"display_name\": \"${DISPLAY_NAME}\",
          \"link_url\": \"${SVC_URL}\",
          \"type\": \"link\",
          \"sort_order\": ${SORT_ORDER}
        }" > /dev/null 2>&1 && echo "    Erstellt: ${SVC_NAME}" || echo "    Fehlgeschlagen: ${SVC_NAME}"
    fi
  done

  # ── Also create/find the workspace-services channel ──────────────────
  SVC_CHANNEL_JSON=$(mm_api GET "/teams/${TEAM_ID}/channels/name/workspace-services" 2>/dev/null || echo "")
  SVC_CHANNEL_ID=$(echo "${SVC_CHANNEL_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

  if [ -z "${SVC_CHANNEL_ID}" ]; then
    SVC_CHANNEL_JSON=$(mm_api POST "/channels" \
      -d "{
        \"team_id\": \"${TEAM_ID}\",
        \"name\": \"workspace-services\",
        \"display_name\": \"Workspace Services\",
        \"purpose\": \"Uebersicht und Links zu allen Workspace-Diensten\",
        \"header\": \"Alle Services der Workspace-Plattform — Bookmarks oben nutzen!\",
        \"type\": \"O\"
      }" 2>/dev/null || echo "")
    SVC_CHANNEL_ID=$(echo "${SVC_CHANNEL_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
    if [ -n "${SVC_CHANNEL_ID}" ]; then
      echo "  Kanal 'workspace-services' erstellt."
    fi
  else
    echo "  Kanal 'workspace-services' existiert bereits."
  fi

  # ── Add bookmarks to workspace-services channel too ──────────────────
  if [ -n "${SVC_CHANNEL_ID}" ]; then
    EXISTING_SVC_BOOKMARKS=$(mm_api GET "/channels/${SVC_CHANNEL_ID}/bookmarks" 2>/dev/null || echo "[]")
    SORT_ORDER=0
    for SERVICE_DEF in "${SERVICES[@]}"; do
      IFS='|' read -r SVC_NAME SVC_EMOJI SVC_URL SVC_DESC <<< "${SERVICE_DEF}"
      SORT_ORDER=$((SORT_ORDER + 10))
      DISPLAY_NAME="${SVC_EMOJI} ${SVC_NAME}"

      BOOKMARK_EXISTS=$(echo "${EXISTING_SVC_BOOKMARKS}" | python3 -c "
import sys,json
bookmarks = json.load(sys.stdin)
for b in bookmarks:
    if b.get('link_url','') == '${SVC_URL}':
        print(b['id'])
        break
" 2>/dev/null || echo "")

      if [ -z "${BOOKMARK_EXISTS}" ]; then
        mm_api POST "/channels/${SVC_CHANNEL_ID}/bookmarks" \
          -d "{
            \"display_name\": \"${DISPLAY_NAME}\",
            \"link_url\": \"${SVC_URL}\",
            \"type\": \"link\",
            \"sort_order\": ${SORT_ORDER}
          }" > /dev/null 2>&1
      fi
    done

    # ── Post pinned service directory message ──────────────────────────
    # Build table rows
    TABLE_ROWS=""
    for SERVICE_DEF in "${SERVICES[@]}"; do
      IFS='|' read -r SVC_NAME SVC_EMOJI SVC_URL SVC_DESC <<< "${SERVICE_DEF}"
      TABLE_ROWS="${TABLE_ROWS}| ${SVC_EMOJI} **${SVC_NAME}** | [${SVC_URL##*://}](${SVC_URL}) | ${SVC_DESC} |\n"
    done

    MSG=$(cat <<MSGEOF
### :link: Workspace Service-Verzeichnis

Alle Services der Plattform auf einen Blick:

| Service | URL | Beschreibung |
|---------|-----|--------------|
${TABLE_ROWS}
---

**Schnellzugriff:** Nutze die **Bookmarks** oben im Kanal-Header!

**Login:** Alle Services nutzen **Single Sign-On** ueber [Keycloak](${SCHEME}://${KC_DOMAIN}). Einmal anmelden — ueberall eingeloggt.

**Hilfe:** Bei Fragen den Kanal \`claude-code\` nutzen oder die [Dokumentation](${SCHEME}://${DOCS_DOMAIN}) lesen.
MSGEOF
)

    # Check if a service-directory post already exists (avoid duplicates)
    EXISTING_POSTS=$(mm_api POST "/channels/${SVC_CHANNEL_ID}/posts/search" \
      -d "{\"terms\": \"Workspace Service-Verzeichnis\", \"is_or_search\": false}" 2>/dev/null || echo "{}")
    POST_COUNT=$(echo "${EXISTING_POSTS}" | python3 -c "
import sys,json
data = json.load(sys.stdin)
posts = data.get('posts', {})
print(len([p for p in posts.values() if 'Workspace Service-Verzeichnis' in p.get('message','')]))
" 2>/dev/null || echo "0")

    if [ "${POST_COUNT}" = "0" ]; then
      # Post and pin the message
      POST_JSON=$(mm_api POST "/posts" \
        -d "{
          \"channel_id\": \"${SVC_CHANNEL_ID}\",
          \"message\": $(echo "${MSG}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
        }")
      POST_ID=$(echo "${POST_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

      if [ -n "${POST_ID}" ]; then
        mm_api POST "/posts/${POST_ID}/pin" > /dev/null 2>&1
        echo "  Service-Verzeichnis gepostet und gepinnt."
      fi
    else
      echo "  Service-Verzeichnis existiert bereits."
    fi
  fi

  # ── Update Town Square header with service links ──────────────────────
  HEADER="$(printf ':file_folder: [Dateien](%s://%s) | :key: [SSO](%s://%s) | :receipt: [Rechnungen](%s://%s) | :lock: [Passwoerter](%s://%s) | :books: [Docs](%s://%s) | :globe_with_meridians: [Website](%s://%s)' \
    "${SCHEME}" "${NC_DOMAIN}" \
    "${SCHEME}" "${KC_DOMAIN}" \
    "${SCHEME}" "${BILLING_DOMAIN}" \
    "${SCHEME}" "${VAULT_DOMAIN}" \
    "${SCHEME}" "${DOCS_DOMAIN}" \
    "${SCHEME}" "${WEB_DOMAIN}")"

  mm_api PUT "/channels/${CHANNEL_ID}/patch" \
    -d "{\"header\": $(echo "${HEADER}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}" > /dev/null 2>&1 \
    && echo "  Town Square Header aktualisiert." \
    || echo "  WARNUNG: Town Square Header konnte nicht aktualisiert werden."

done

# ── Cleanup temporary token ──────────────────────────────────────────────
if [ "${CLEANUP_TOKEN:-}" = "true" ] && [ -n "${MM_TOKEN}" ]; then
  mm_api POST "/users/tokens/revoke" -d "{\"token_id\": \"${MM_TOKEN}\"}" > /dev/null 2>&1 || true
fi

echo ""
echo "=== Konnektor-Setup abgeschlossen ==="
echo ""
echo "Ergebnis:"
echo "  - Channel Bookmarks in Town Square fuer alle Services"
echo "  - Kanal 'workspace-services' mit allen Links + gepinnter Nachricht"
echo "  - Town Square Header mit Schnell-Links"
echo ""
echo "Services:"
for SERVICE_DEF in "${SERVICES[@]}"; do
  IFS='|' read -r SVC_NAME SVC_EMOJI SVC_URL SVC_DESC <<< "${SERVICE_DEF}"
  printf "  %-20s %s\n" "${SVC_NAME}" "${SVC_URL}"
done
