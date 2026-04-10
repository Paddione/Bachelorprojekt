#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# mattermost-connectors-setup.sh
# Creates a "workspace-services" channel with a pinned service directory and
# updates Town Square's header with quick-links to all workspace services.
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

# ── Helper: REST API call via external curl ───────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Generate token if needed ─────────────────────────────────────────────
if [ -z "${MM_TOKEN}" ]; then
  echo "Kein MM_TOKEN gesetzt — generiere temporaeren Token via mmctl..."
  ADMIN_USER_ID=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local user list --json 2>/dev/null | \
    python3 -c "
import sys,json
users = json.load(sys.stdin) or []
admins = [u for u in users if 'system_admin' in u.get('roles','')]
if admins:
    print(admins[0]['id'])
" 2>/dev/null) || true

  if [ -n "${ADMIN_USER_ID}" ]; then
    TOKEN_OUTPUT=$(kubectl exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local token generate "${ADMIN_USER_ID}" "connectors-setup-$(date +%s)" 2>/dev/null) || true
    MM_TOKEN=$(echo "${TOKEN_OUTPUT}" | grep -oP '^[a-z0-9]{26}' | head -1) || true
  fi

  if [ -z "${MM_TOKEN}" ]; then
    echo "  FEHLER: Konnte keinen API-Token generieren."
    echo "  Erstelle manuell: Mattermost > Profil > Sicherheit > Persoenliche Zugriffstoken"
    echo "  Dann: MM_TOKEN=<token> bash $0"
    exit 1
  fi
  echo "  Token generiert."
  CLEANUP_TOKEN="true"
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

# ── Build service table for pinned message ────────────────────────────────
TABLE_ROWS=""
for SERVICE_DEF in "${SERVICES[@]}"; do
  IFS='|' read -r SVC_NAME SVC_EMOJI SVC_URL SVC_DESC <<< "${SERVICE_DEF}"
  TABLE_ROWS="${TABLE_ROWS}| ${SVC_EMOJI} **${SVC_NAME}** | [${SVC_URL##*://}](${SVC_URL}) | ${SVC_DESC} |\n"
done

SERVICE_DIRECTORY_MSG="### :link: Workspace Service-Verzeichnis

Alle Services der Plattform auf einen Blick:

| Service | URL | Beschreibung |
|---------|-----|--------------|
$(echo -e "${TABLE_ROWS}")
---

**Login:** Alle Services nutzen **Single Sign-On** ueber [Keycloak](${SCHEME}://${KC_DOMAIN}). Einmal anmelden — ueberall eingeloggt.

**Hilfe:** Bei Fragen den Kanal \`claude-code\` nutzen oder die [Dokumentation](${SCHEME}://${DOCS_DOMAIN}) lesen."

# ── Town Square header with quick-links ───────────────────────────────────
TOWN_SQUARE_HEADER=":file_folder: [Dateien](${SCHEME}://${NC_DOMAIN}) | :key: [SSO](${SCHEME}://${KC_DOMAIN}) | :receipt: [Rechnungen](${SCHEME}://${BILLING_DOMAIN}) | :lock: [Passwoerter](${SCHEME}://${VAULT_DOMAIN}) | :books: [Docs](${SCHEME}://${DOCS_DOMAIN}) | :globe_with_meridians: [Website](${SCHEME}://${WEB_DOMAIN})"

# ── workspace-services channel header ─────────────────────────────────────
SVC_CHANNEL_HEADER=":file_folder: [Dateien](${SCHEME}://${NC_DOMAIN}) | :pencil: [Office](${SCHEME}://${COLLABORA_DOMAIN}) | :key: [SSO](${SCHEME}://${KC_DOMAIN}) | :receipt: [Rechnungen](${SCHEME}://${BILLING_DOMAIN}) | :lock: [Passwoerter](${SCHEME}://${VAULT_DOMAIN}) | :books: [Docs](${SCHEME}://${DOCS_DOMAIN}) | :art: [Whiteboard](${SCHEME}://${WHITEBOARD_DOMAIN}) | :robot_face: [KI](${SCHEME}://${AI_DOMAIN})"

# ── Process each team ─────────────────────────────────────────────────────
echo "${TEAMS_JSON}" | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(t['id'], t['name'])
" | while read -r TEAM_ID TEAM_NAME; do
  echo ""
  echo "── Team: ${TEAM_NAME} ──────────────────────────────────"

  # ── 1. Update Town Square header ───────────────────────────────────────
  TS_JSON=$(mm_api GET "/teams/${TEAM_ID}/channels/name/town-square")
  TS_CHANNEL_ID=$(echo "${TS_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

  if [ -z "${TS_CHANNEL_ID}" ]; then
    echo "  FEHLER: Town Square nicht gefunden in Team ${TEAM_NAME}"
    continue
  fi

  mm_api PUT "/channels/${TS_CHANNEL_ID}/patch" \
    -d "{\"header\": $(echo "${TOWN_SQUARE_HEADER}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}" > /dev/null 2>&1 \
    && echo "  Town Square Header aktualisiert mit Service-Links." \
    || echo "  WARNUNG: Town Square Header konnte nicht aktualisiert werden."

  # ── 2. Create/find workspace-services channel ──────────────────────────
  SVC_CHANNEL_JSON=$(mm_api GET "/teams/${TEAM_ID}/channels/name/workspace-services" 2>/dev/null || echo "")
  SVC_CHANNEL_ID=$(echo "${SVC_CHANNEL_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

  if [ -z "${SVC_CHANNEL_ID}" ]; then
    SVC_CHANNEL_JSON=$(mm_api POST "/channels" \
      -d "{
        \"team_id\": \"${TEAM_ID}\",
        \"name\": \"workspace-services\",
        \"display_name\": \"Workspace Services\",
        \"purpose\": \"Uebersicht und Links zu allen Workspace-Diensten\",
        \"type\": \"O\"
      }")
    SVC_CHANNEL_ID=$(echo "${SVC_CHANNEL_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
    if [ -n "${SVC_CHANNEL_ID}" ]; then
      echo "  Kanal 'workspace-services' erstellt."
    else
      echo "  FEHLER: Kanal 'workspace-services' konnte nicht erstellt werden."
      continue
    fi
  else
    echo "  Kanal 'workspace-services' existiert bereits."
  fi

  # Update channel header with all service links
  mm_api PUT "/channels/${SVC_CHANNEL_ID}/patch" \
    -d "{\"header\": $(echo "${SVC_CHANNEL_HEADER}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}" > /dev/null 2>&1 \
    && echo "  workspace-services Header aktualisiert." \
    || echo "  WARNUNG: workspace-services Header konnte nicht aktualisiert werden."

  # ── 3. Post pinned service directory (if not already posted) ───────────
  SEARCH_RESULT=$(mm_api POST "/teams/${TEAM_ID}/posts/search" \
    -d '{"terms": "Workspace Service-Verzeichnis", "is_or_search": false}' 2>/dev/null || echo "{}")
  EXISTING_COUNT=$(echo "${SEARCH_RESULT}" | python3 -c "
import sys,json
data = json.load(sys.stdin)
posts = data.get('posts', {})
count = len([p for p in posts.values()
             if 'Workspace Service-Verzeichnis' in p.get('message','')
             and p.get('channel_id','') == '${SVC_CHANNEL_ID}'])
print(count)
" 2>/dev/null || echo "0")

  if [ "${EXISTING_COUNT}" = "0" ]; then
    POST_JSON=$(mm_api POST "/posts" \
      -d "{
        \"channel_id\": \"${SVC_CHANNEL_ID}\",
        \"message\": $(echo "${SERVICE_DIRECTORY_MSG}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
      }")
    POST_ID=$(echo "${POST_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [ -n "${POST_ID}" ]; then
      mm_api POST "/posts/${POST_ID}/pin" > /dev/null 2>&1
      echo "  Service-Verzeichnis gepostet und gepinnt."
    else
      echo "  WARNUNG: Service-Verzeichnis konnte nicht gepostet werden."
    fi
  else
    echo "  Service-Verzeichnis existiert bereits — uebersprungen."
  fi

  # ── 4. Post welcome message in Town Square (once) ──────────────────────
  TS_SEARCH=$(mm_api POST "/teams/${TEAM_ID}/posts/search" \
    -d '{"terms": "Workspace-Plattform Service-Links", "is_or_search": false}' 2>/dev/null || echo "{}")
  TS_EXISTS=$(echo "${TS_SEARCH}" | python3 -c "
import sys,json
data = json.load(sys.stdin)
posts = data.get('posts', {})
count = len([p for p in posts.values()
             if 'Workspace-Plattform Service-Links' in p.get('message','')
             and p.get('channel_id','') == '${TS_CHANNEL_ID}'])
print(count)
" 2>/dev/null || echo "0")

  if [ "${TS_EXISTS}" = "0" ]; then
    WELCOME_MSG=":wave: **Workspace-Plattform Service-Links**

Alle Services sind ueber den Browser erreichbar — SSO-Login ueber Keycloak:

:file_folder: **[Nextcloud — Dateien](${SCHEME}://${NC_DOMAIN})** — Dateien, Kalender, Kontakte, Talk (Video)
:pencil: **[Collabora — Office](${SCHEME}://${COLLABORA_DOMAIN})** — Dokumente, Tabellen, Praesentationen im Browser
:receipt: **[Invoice Ninja — Rechnungen](${SCHEME}://${BILLING_DOMAIN})** — Buchhaltung & Rechnungsstellung
:lock: **[Vaultwarden — Passwoerter](${SCHEME}://${VAULT_DOMAIN})** — Team-Passwort-Manager
:books: **[Dokumentation](${SCHEME}://${DOCS_DOMAIN})** — Anleitungen & Referenz
:art: **[Whiteboard](${SCHEME}://${WHITEBOARD_DOMAIN})** — Gemeinsam zeichnen & brainstormen
:robot_face: **[Claude Code — KI](${SCHEME}://${AI_DOMAIN})** — KI-Assistent (MCP Status)
:globe_with_meridians: **[Website](${SCHEME}://${WEB_DOMAIN})** — Unternehmens-Website
:envelope: **[Mailpit — E-Mail](${SCHEME}://${MAIL_DOMAIN})** — E-Mail-Testumgebung

> Detaillierte Uebersicht im Kanal **~workspace-services**"

    POST_JSON=$(mm_api POST "/posts" \
      -d "{
        \"channel_id\": \"${TS_CHANNEL_ID}\",
        \"message\": $(echo "${WELCOME_MSG}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
      }")
    POST_ID=$(echo "${POST_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [ -n "${POST_ID}" ]; then
      mm_api POST "/posts/${POST_ID}/pin" > /dev/null 2>&1
      echo "  Willkommensnachricht in Town Square gepostet und gepinnt."
    fi
  else
    echo "  Willkommensnachricht in Town Square existiert bereits."
  fi

done

# ── Cleanup temporary token ──────────────────────────────────────────────
if [ "${CLEANUP_TOKEN:-}" = "true" ] && [ -n "${MM_TOKEN}" ]; then
  # Find token ID to revoke
  TOKEN_ID=$(mm_api GET "/users/me/tokens" 2>/dev/null | python3 -c "
import sys,json
tokens = json.load(sys.stdin) or []
for t in tokens:
    if 'connectors-setup' in t.get('description',''):
        print(t['id'])
        break
" 2>/dev/null || echo "")
  if [ -n "${TOKEN_ID}" ]; then
    mm_api POST "/users/tokens/revoke" -d "{\"token_id\": \"${TOKEN_ID}\"}" > /dev/null 2>&1
    echo ""
    echo "  Temporaerer Token bereinigt."
  fi
fi

echo ""
echo "=== Konnektor-Setup abgeschlossen ==="
echo ""
echo "Ergebnis:"
echo "  - Town Square Header mit Schnell-Links zu allen Services"
echo "  - Kanal 'workspace-services' mit gepinntem Service-Verzeichnis"
echo "  - Gepinnte Willkommensnachricht in Town Square"
echo ""
echo "Services:"
for SERVICE_DEF in "${SERVICES[@]}"; do
  IFS='|' read -r SVC_NAME SVC_EMOJI SVC_URL SVC_DESC <<< "${SERVICE_DEF}"
  printf "  %-20s %s\n" "${SVC_NAME}" "${SVC_URL}"
done
