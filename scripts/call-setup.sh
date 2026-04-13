#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# call-setup.sh
# Registers the /call slash command in Mattermost (all teams).
# Pointing to billing-bot /slash endpoint.
#
# Usage:
#   bash scripts/call-setup.sh                         # auto-detect via mmctl
#   MM_TOKEN=<token> bash scripts/call-setup.sh        # use API token
#
# Environment:
#   MM_URL       - Mattermost URL (default: auto-detect from SiteURL)
#   MM_TOKEN     - Personal access token (skip mmctl)
#   NAMESPACE    - Kubernetes namespace (default: workspace)
#   KUBE_CONTEXT - kubectl context to use (optional, for prod clusters)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
MM_URL="${MM_URL:-}"
MM_TOKEN="${MM_TOKEN:-}"
KUBE_CTX_FLAG=""

if [ -n "${KUBE_CONTEXT:-}" ]; then
  KUBE_CTX_FLAG="--context=${KUBE_CONTEXT}"
fi

KUBECTL="kubectl ${KUBE_CTX_FLAG}"

echo "=== /call Slash-Command Setup ==="
echo ""

# ── Auto-detect Mattermost URL ────────────────────────────────────────────
if [ -z "${MM_URL}" ]; then
  MM_URL=$(${KUBECTL} exec -n "${NAMESPACE}" deploy/mattermost -- \
    printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
fi

echo "  Mattermost: ${MM_URL}"

# ── Generate token via mmctl if needed ──────────────────────────────────
if [ -z "${MM_TOKEN}" ]; then
  ADMIN_USER_ID=$(${KUBECTL} exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local user list --json 2>/dev/null | \
    python3 -c "
import sys,json
users = json.load(sys.stdin) or []
admins = [u for u in users if 'system_admin' in u.get('roles','')]
if admins: print(admins[0]['id'])
" 2>/dev/null) || true

  if [ -n "${ADMIN_USER_ID}" ]; then
    TOKEN_OUTPUT=$(${KUBECTL} exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local token generate "${ADMIN_USER_ID}" "call-setup-$(date +%s)" 2>/dev/null) || true
    MM_TOKEN=$(echo "${TOKEN_OUTPUT}" | grep -oP '^[a-z0-9]{26}' | head -1) || true
  fi

  if [ -z "${MM_TOKEN}" ]; then
    echo "FEHLER: Konnte keinen API-Token generieren."
    exit 1
  fi
  CLEANUP_TOKEN="true"
fi

# ── Helper: REST API ─────────────────────────────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Get all teams ────────────────────────────────────────────────────────
TEAMS=$(mm_api GET "/teams")
TEAM_COUNT=$(echo "${TEAMS}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [ "${TEAM_COUNT}" = "0" ] || [ -z "${TEAM_COUNT}" ]; then
  echo "FEHLER: Keine Teams gefunden."
  exit 1
fi

echo "  ${TEAM_COUNT} Team(s) gefunden."
echo ""

# ── Register /call in each team ──────────────────────────────────────────
echo "${TEAMS}" | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(t['id'], t['name'])
" | while read -r TEAM_ID TEAM_NAME; do
  echo "── Team: ${TEAM_NAME} ──────────────────────────────────"

  EXISTING=$(mm_api GET "/teams/${TEAM_ID}/commands" 2>/dev/null | python3 -c "
import sys,json
cmds = json.load(sys.stdin) or []
for c in cmds:
    if c.get('trigger') == 'call':
        print(c['id'])
        break
" 2>/dev/null || echo "")

  PAYLOAD="{
    \"team_id\": \"${TEAM_ID}\",
    \"trigger\": \"call\",
    \"method\": \"P\",
    \"url\": \"http://billing-bot:8090/slash\",
    \"display_name\": \"Nextcloud Talk Call\",
    \"description\": \"Erstellt einen Nextcloud Talk Video-Call-Raum\",
    \"auto_complete\": true,
    \"auto_complete_hint\": \"\",
    \"auto_complete_desc\": \"Neuen Video-Call in Nextcloud Talk starten\"
  }"

  if [ -n "${EXISTING}" ]; then
    mm_api PUT "/commands/${EXISTING}" \
      -d "$(echo "${PAYLOAD}" | python3 -c "import sys,json; d=json.load(sys.stdin); d['id']='${EXISTING}'; print(json.dumps(d))")" \
      > /dev/null 2>&1 \
      && echo "  /call aktualisiert." \
      || echo "  WARNUNG: /call konnte nicht aktualisiert werden."
  else
    mm_api POST "/commands" -d "${PAYLOAD}" > /dev/null 2>&1 \
      && echo "  /call registriert." \
      || echo "  FEHLER: /call konnte nicht registriert werden."
  fi
done

# ── Cleanup token ────────────────────────────────────────────────────────
if [ "${CLEANUP_TOKEN:-}" = "true" ] && [ -n "${MM_TOKEN}" ]; then
  TOKEN_ID=$(mm_api GET "/users/me/tokens" 2>/dev/null | python3 -c "
import sys,json
for t in (json.load(sys.stdin) or []):
    if 'call-setup' in t.get('description',''):
        print(t['id']); break
" 2>/dev/null || echo "")
  if [ -n "${TOKEN_ID}" ]; then
    mm_api POST "/users/tokens/revoke" -d "{\"token_id\": \"${TOKEN_ID}\"}" > /dev/null 2>&1
    echo ""
    echo "  Temporaerer Token bereinigt."
  fi
fi

echo ""
echo "=== /call Setup abgeschlossen ==="
echo "  Verwende /call in einem beliebigen Mattermost-Kanal."
