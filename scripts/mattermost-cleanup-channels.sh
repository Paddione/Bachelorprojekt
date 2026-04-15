#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# mattermost-cleanup-channels.sh
# Bereinigt Mattermost-Kanäle in Live-Umgebungen:
#   - Löscht doppelte Service-Verzeichnis-Posts in workspace-services
#   - Löscht doppelte Willkommensposts in Town Square
#   - Aktualisiert Channel-Header mit aktuellen Production-Domains
#   - Erstellt saubere, aktuelle Posts (1x pro Kanal)
#
# Usage:
#   bash scripts/mattermost-cleanup-channels.sh korczewski
#   bash scripts/mattermost-cleanup-channels.sh mentolder
#   bash scripts/mattermost-cleanup-channels.sh korczewski mentolder
#
# Environment:
#   NAMESPACE  - Kubernetes namespace (default: workspace)
#   DRY_RUN    - "true": nur anzeigen, nichts ändern
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
DRY_RUN="${DRY_RUN:-false}"

# Globale Variablen für mm_api (werden pro Kontext gesetzt)
MM_URL=""
MM_TOKEN=""

CONTEXTS=("$@")
if [ "${#CONTEXTS[@]}" -eq 0 ]; then
  echo "Usage: $0 <kubectl-context> [<kubectl-context> ...]"
  echo "  Beispiel: $0 korczewski mentolder"
  exit 1
fi

# ── Logging ───────────────────────────────────────────────────────────────────
log()  { echo "  $*"; }
warn() { echo "  WARNUNG: $*"; }
ok()   { echo "  OK: $*"; }
dry()  { echo "  [DRY] $*"; }

# ── Mattermost REST API ───────────────────────────────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Post löschen ──────────────────────────────────────────────────────────────
delete_post() {
  local post_id="$1" reason="$2"
  if [ "${DRY_RUN}" = "true" ]; then
    dry "würde Post ${post_id} löschen (${reason})"
    return 0
  fi
  mm_api DELETE "/posts/${post_id}" > /dev/null 2>&1 \
    && ok "Post ${post_id} gelöscht (${reason})" \
    || warn "Post ${post_id} konnte nicht gelöscht werden"
}

# ── Channel-Header setzen ─────────────────────────────────────────────────────
update_channel_header() {
  local channel_id="$1" header="$2" label="$3"
  if [ "${DRY_RUN}" = "true" ]; then
    dry "würde Header von ${label} aktualisieren"
    return 0
  fi
  mm_api PUT "/channels/${channel_id}/patch" \
    -d "{\"header\": $(echo "${header}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}" \
    > /dev/null 2>&1 \
    && ok "${label} Header aktualisiert" \
    || warn "${label} Header konnte nicht aktualisiert werden"
}

# ── Post aktualisieren ────────────────────────────────────────────────────────
update_post() {
  local post_id="$1" message="$2" label="$3"
  if [ "${DRY_RUN}" = "true" ]; then
    dry "würde Post ${post_id} in ${label} aktualisieren"
    return 0
  fi
  mm_api PUT "/posts/${post_id}/patch" \
    -d "{\"message\": $(echo "${message}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")}" \
    > /dev/null 2>&1 \
    && ok "Post in ${label} aktualisiert (${post_id})" \
    || warn "Post ${post_id} in ${label} konnte nicht aktualisiert werden"
}

# ── Post erstellen und pinnen ─────────────────────────────────────────────────
post_and_pin() {
  local channel_id="$1" message="$2" label="$3"
  if [ "${DRY_RUN}" = "true" ]; then
    dry "würde neuen Post in ${label} erstellen und pinnen"
    return 0
  fi
  local post_json post_id
  post_json=$(mm_api POST "/posts" \
    -d "{\"channel_id\": \"${channel_id}\", \"message\": $(echo "${message}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")}")
  post_id=$(echo "${post_json}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -n "${post_id}" ]; then
    mm_api POST "/posts/${post_id}/pin" > /dev/null 2>&1
    ok "Post in ${label} erstellt und gepinnt (${post_id})"
  else
    warn "Post in ${label} konnte nicht erstellt werden"
  fi
}

# ── Posts mit Suchbegriff im Kanal finden (älteste zuerst) ───────────────────
find_posts_in_channel() {
  local team_id="$1" channel_id="$2" search_term="$3"
  mm_api POST "/teams/${team_id}/posts/search" \
    -d "{\"terms\": \"${search_term}\", \"is_or_search\": false}" 2>/dev/null \
  | python3 -c "
import sys,json
data = json.load(sys.stdin)
posts = data.get('posts', {})
result = [(p['id'], p['create_at']) for p in posts.values()
          if '${search_term}' in p.get('message','')
          and p.get('channel_id','') == '${channel_id}']
result.sort(key=lambda x: x[1])  # älteste zuerst
for pid, _ in result:
    print(pid)
" 2>/dev/null || true
}

# ── Kanal bereinigen: Duplikate löschen, verbleibenden Post aktualisieren ─────
cleanup_channel_posts() {
  local team_id="$1" channel_id="$2" search_term="$3" new_message="$4" label="$5"

  local posts post_count newest_id
  posts=$(find_posts_in_channel "${team_id}" "${channel_id}" "${search_term}")
  post_count=0
  [ -n "${posts}" ] && post_count=$(echo "${posts}" | wc -l | tr -d ' ')

  log "${label}: ${post_count} passende Posts gefunden (Suchbegriff: '${search_term}')"

  if [ "${post_count}" -eq 0 ]; then
    log "Kein Post vorhanden — erstelle neuen..."
    post_and_pin "${channel_id}" "${new_message}" "${label}"
    return 0
  fi

  newest_id=$(echo "${posts}" | tail -1)

  # Alle außer dem neuesten löschen
  if [ "${post_count}" -gt 1 ]; then
    while IFS= read -r pid; do
      if [ "${pid}" != "${newest_id}" ]; then
        delete_post "${pid}" "Duplikat in ${label}"
      fi
    done <<< "${posts}"
  fi

  # Neuesten Post auf aktuelle Inhalte aktualisieren
  update_post "${newest_id}" "${new_message}" "${label}"
  # Sicherstellen dass er gepinnt ist
  if [ "${DRY_RUN}" != "true" ]; then
    mm_api POST "/posts/${newest_id}/pin" > /dev/null 2>&1 || true
  fi
}

# ── Einen Kontext (Cluster) verarbeiten ───────────────────────────────────────
process_context() {
  local CTX="$1"
  echo ""
  echo "══════════════════════════════════════════════════════"
  echo "  Kontext: ${CTX}"
  echo "══════════════════════════════════════════════════════"

  # Mattermost URL — zuerst via mmctl config (JSON-Ausgabe), sonst aus ConfigMap
  local RAW_URL
  RAW_URL=$(kubectl --context="${CTX}" exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local config get ServiceSettings.SiteURL 2>/dev/null \
    | python3 -c "import sys,json; v=sys.stdin.read().strip(); print(json.loads(v) if v.startswith('\"') else v)" \
    2>/dev/null) || true

  if [ -z "${RAW_URL}" ]; then
    # Fallback: aus ConfigMap (MM_DOMAIN) mit https-Prefix
    local MM_DOMAIN
    MM_DOMAIN=$(kubectl --context="${CTX}" get configmap domain-config -n "${NAMESPACE}" \
      -o jsonpath="{.data.MM_DOMAIN}" 2>/dev/null || echo "")
    if [ -n "${MM_DOMAIN}" ]; then
      RAW_URL="https://${MM_DOMAIN}"
    fi
  fi

  MM_URL="${RAW_URL}"
  if [ -z "${MM_URL}" ]; then
    warn "Konnte Mattermost URL nicht ermitteln — überspringe ${CTX}"
    return 1
  fi
  log "Mattermost URL: ${MM_URL}"

  # Domains aus ConfigMap lesen
  read_domain() {
    kubectl --context="${CTX}" get configmap domain-config -n "${NAMESPACE}" \
      -o "jsonpath={.data.$1}" 2>/dev/null || echo "$2"
  }

  local KC_DOMAIN NC_DOMAIN BILLING_DOMAIN VAULT_DOMAIN DOCS_DOMAIN WEB_DOMAIN AI_DOMAIN SCHEME
  SCHEME="https"
  KC_DOMAIN=$(read_domain "KC_DOMAIN" "auth.${CTX}.de")
  NC_DOMAIN=$(read_domain "NC_DOMAIN" "files.${CTX}.de")
  BILLING_DOMAIN=$(read_domain "BILLING_DOMAIN" "billing.${CTX}.de")
  VAULT_DOMAIN=$(read_domain "VAULT_DOMAIN" "vault.${CTX}.de")
  DOCS_DOMAIN=$(read_domain "DOCS_DOMAIN" "docs.${CTX}.de")
  WEB_DOMAIN=$(read_domain "WEB_DOMAIN" "web.${CTX}.de")
  AI_DOMAIN=$(read_domain "AI_DOMAIN" "ai.${CTX}.de")

  log "Domains: NC=${NC_DOMAIN} | KC=${KC_DOMAIN} | BILLING=${BILLING_DOMAIN}"
  log "         VAULT=${VAULT_DOMAIN} | DOCS=${DOCS_DOMAIN} | WEB=${WEB_DOMAIN} | AI=${AI_DOMAIN}"

  # API-Token via mmctl generieren
  MM_TOKEN=""
  local ADMIN_USER_ID TOKEN_OUTPUT
  ADMIN_USER_ID=$(kubectl --context="${CTX}" exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local user list --json 2>/dev/null | \
    python3 -c "
import sys,json
users = json.load(sys.stdin) or []
admins = [u for u in users if 'system_admin' in u.get('roles','')]
if admins:
    print(admins[0]['id'])
" 2>/dev/null) || true

  if [ -z "${ADMIN_USER_ID}" ]; then
    warn "Kein Admin-User gefunden — überspringe ${CTX}"
    return 1
  fi

  TOKEN_OUTPUT=$(kubectl --context="${CTX}" exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local token generate "${ADMIN_USER_ID}" "cleanup-$(date +%s)" 2>/dev/null) || true
  MM_TOKEN=$(echo "${TOKEN_OUTPUT}" | grep -oP '^[a-z0-9]{26}' | head -1) || true

  if [ -z "${MM_TOKEN}" ]; then
    warn "Konnte keinen API-Token generieren — überspringe ${CTX}"
    return 1
  fi
  log "API-Token generiert."

  # ── Texte (Production, ohne Mailpit/localhost) ────────────────────────────
  local TOWN_SQUARE_HEADER SVC_CHANNEL_HEADER SERVICE_DIRECTORY_MSG WELCOME_MSG

  TOWN_SQUARE_HEADER=":file_folder: [Dateien](${SCHEME}://${NC_DOMAIN}) | :movie_camera: [Talk](${SCHEME}://${NC_DOMAIN}/apps/spreed) | :key: [SSO](${SCHEME}://${KC_DOMAIN}) | :receipt: [Rechnungen](${SCHEME}://${BILLING_DOMAIN}) | :lock: [Passwoerter](${SCHEME}://${VAULT_DOMAIN}) | :books: [Docs](${SCHEME}://${DOCS_DOMAIN}) | :globe_with_meridians: [Website](${SCHEME}://${WEB_DOMAIN})"

  SVC_CHANNEL_HEADER=":file_folder: [Dateien](${SCHEME}://${NC_DOMAIN}) | :movie_camera: [Talk](${SCHEME}://${NC_DOMAIN}/apps/spreed) | :key: [SSO](${SCHEME}://${KC_DOMAIN}) | :receipt: [Rechnungen](${SCHEME}://${BILLING_DOMAIN}) | :lock: [Passwoerter](${SCHEME}://${VAULT_DOMAIN}) | :books: [Docs](${SCHEME}://${DOCS_DOMAIN}) | :globe_with_meridians: [Website](${SCHEME}://${WEB_DOMAIN}) | :robot_face: [MCP Status](${SCHEME}://${AI_DOMAIN})"

  SERVICE_DIRECTORY_MSG="### :link: Workspace Service-Verzeichnis

Alle direkt erreichbaren Services auf einen Blick:

| Service | URL | Beschreibung |
|---------|-----|--------------|
| :file_folder: **Nextcloud** | [${NC_DOMAIN}](${SCHEME}://${NC_DOMAIN}) | Dateien, Kalender, Kontakte & gemeinsame Ordner |
| :movie_camera: **Nextcloud Talk** | [${NC_DOMAIN}/apps/spreed](${SCHEME}://${NC_DOMAIN}/apps/spreed) | Video-Konferenzen & Gruppen-Calls |
| :key: **Keycloak** | [${KC_DOMAIN}](${SCHEME}://${KC_DOMAIN}) | SSO & Benutzerverwaltung |
| :receipt: **Invoice Ninja** | [${BILLING_DOMAIN}](${SCHEME}://${BILLING_DOMAIN}) | Rechnungen & Buchhaltung |
| :lock: **Vaultwarden** | [${VAULT_DOMAIN}](${SCHEME}://${VAULT_DOMAIN}) | Passwort-Manager |
| :books: **Dokumentation** | [${DOCS_DOMAIN}](${SCHEME}://${DOCS_DOMAIN}) | Anleitungen & Referenz |
| :globe_with_meridians: **Website** | [${WEB_DOMAIN}](${SCHEME}://${WEB_DOMAIN}) | Unternehmens-Website |
| :robot_face: **MCP Status** | [${AI_DOMAIN}](${SCHEME}://${AI_DOMAIN}) | KI-Infrastruktur & MCP-Server Status |

---

:pencil: **Collabora Office** und :art: **Whiteboard** sind in Nextcloud integriert und werden von dort aus geoeffnet — kein eigener Aufruf noetig.

**Login:** Alle Services nutzen **Single Sign-On** ueber [Keycloak](${SCHEME}://${KC_DOMAIN}). Einmal anmelden — ueberall eingeloggt.

**Hilfe:** Bei Fragen den Kanal \`claude-code\` nutzen oder die [Dokumentation](${SCHEME}://${DOCS_DOMAIN}) lesen."

  WELCOME_MSG=":wave: **Workspace-Plattform — Uebersicht aller Services**

Alle Services sind ueber den Browser erreichbar. Einmal mit **Single Sign-On** (Keycloak) anmelden — ueberall eingeloggt.

:file_folder: **[Nextcloud — Dateien](${SCHEME}://${NC_DOMAIN})** — Dateien, Kalender, Kontakte & gemeinsame Ordner
:movie_camera: **[Nextcloud Talk — Video](${SCHEME}://${NC_DOMAIN}/apps/spreed)** — Video-Konferenzen & Gruppen-Calls
:key: **[Keycloak — SSO](${SCHEME}://${KC_DOMAIN})** — Benutzerverwaltung & Single Sign-On
:receipt: **[Invoice Ninja — Rechnungen](${SCHEME}://${BILLING_DOMAIN})** — Buchhaltung & Rechnungsstellung
:lock: **[Vaultwarden — Passwoerter](${SCHEME}://${VAULT_DOMAIN})** — Team-Passwort-Manager
:books: **[Dokumentation](${SCHEME}://${DOCS_DOMAIN})** — Anleitungen & Referenz
:globe_with_meridians: **[Website](${SCHEME}://${WEB_DOMAIN})** — Unternehmens-Website
:robot_face: **[MCP Status](${SCHEME}://${AI_DOMAIN})** — KI-Infrastruktur & MCP-Server Status

> :pencil: **Office-Dokumente & Whiteboards** werden direkt aus Nextcloud heraus geoeffnet — kein separater Login noetig.
> Detaillierte Uebersicht im Kanal **~workspace-services**"

  # ── Teams verarbeiten ─────────────────────────────────────────────────────
  local TEAMS_JSON
  TEAMS_JSON=$(mm_api GET "/teams")

  while read -r TEAM_ID TEAM_NAME; do
    echo ""
    echo "  ── Team: ${TEAM_NAME} (${TEAM_ID}) ──"

    # Town Square
    local TS_JSON TS_CHANNEL_ID
    TS_JSON=$(mm_api GET "/teams/${TEAM_ID}/channels/name/town-square" 2>/dev/null || echo "{}")
    TS_CHANNEL_ID=$(echo "${TS_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [ -z "${TS_CHANNEL_ID}" ]; then
      warn "Town Square nicht gefunden in Team ${TEAM_NAME}"
    else
      update_channel_header "${TS_CHANNEL_ID}" "${TOWN_SQUARE_HEADER}" "Town Square"
      cleanup_channel_posts "${TEAM_ID}" "${TS_CHANNEL_ID}" "Workspace-Plattform" "${WELCOME_MSG}" "Town Square"
    fi

    # workspace-services
    local SVC_JSON SVC_CHANNEL_ID
    SVC_JSON=$(mm_api GET "/teams/${TEAM_ID}/channels/name/workspace-services" 2>/dev/null || echo "{}")
    SVC_CHANNEL_ID=$(echo "${SVC_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [ -z "${SVC_CHANNEL_ID}" ]; then
      log "workspace-services nicht gefunden — erstelle Kanal..."
      if [ "${DRY_RUN}" != "true" ]; then
        SVC_JSON=$(mm_api POST "/channels" \
          -d "{
            \"team_id\": \"${TEAM_ID}\",
            \"name\": \"workspace-services\",
            \"display_name\": \"Workspace Services\",
            \"purpose\": \"Uebersicht und Links zu allen Workspace-Diensten\",
            \"type\": \"O\"
          }")
        SVC_CHANNEL_ID=$(echo "${SVC_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
        [ -n "${SVC_CHANNEL_ID}" ] && ok "Kanal workspace-services erstellt (${SVC_CHANNEL_ID})" || warn "Erstellung fehlgeschlagen"
      else
        dry "würde workspace-services erstellen"
      fi
    else
      ok "Kanal workspace-services gefunden (${SVC_CHANNEL_ID})"
    fi

    if [ -n "${SVC_CHANNEL_ID}" ]; then
      update_channel_header "${SVC_CHANNEL_ID}" "${SVC_CHANNEL_HEADER}" "workspace-services"
      cleanup_channel_posts "${TEAM_ID}" "${SVC_CHANNEL_ID}" "Workspace Service-Verzeichnis" "${SERVICE_DIRECTORY_MSG}" "workspace-services"
    fi

  done < <(echo "${TEAMS_JSON}" | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(t['id'], t['name'])
")

  # Token widerrufen
  local TOKEN_ID
  TOKEN_ID=$(mm_api GET "/users/me/tokens" 2>/dev/null | python3 -c "
import sys,json
tokens = json.load(sys.stdin) or []
for t in tokens:
    if 'cleanup-' in t.get('description',''):
        print(t['id'])
        break
" 2>/dev/null || echo "")
  if [ -n "${TOKEN_ID}" ]; then
    mm_api POST "/users/tokens/revoke" -d "{\"token_id\": \"${TOKEN_ID}\"}" > /dev/null 2>&1
    log "Temporaerer Token bereinigt."
  fi
}

# ── Hauptprogramm ─────────────────────────────────────────────────────────────
echo "=== Mattermost Channel Cleanup + Update ==="
[ "${DRY_RUN}" = "true" ] && echo "  [DRY RUN — keine Aenderungen werden vorgenommen]"
echo ""

for CTX in "${CONTEXTS[@]}"; do
  process_context "${CTX}" || echo "  FEHLER in Kontext ${CTX} — fortfahren mit nächstem"
done

echo ""
echo "=== Cleanup abgeschlossen ==="
