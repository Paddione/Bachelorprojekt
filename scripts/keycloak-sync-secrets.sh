#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# keycloak-sync-secrets.sh — Sync OIDC client secrets → Keycloak Admin API
#
# workspace-secrets ist die einzige Wahrheitsquelle für OIDC-Secrets.
# Dieses Script liest alle *_OIDC_SECRET-Werte aus dem K8s-Secret und
# schreibt sie per Admin REST API in die Keycloak-Datenbank.
# Idempotent — kann jederzeit mehrfach ausgeführt werden.
#
# Usage:
#   bash scripts/keycloak-sync-secrets.sh
#   ENV=mentolder bash scripts/keycloak-sync-secrets.sh
#   task keycloak:sync-secrets ENV=mentolder
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Environment ───────────────────────────────────────────────────────
ENV="${ENV:-dev}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"

KC_NAMESPACE="${KC_NAMESPACE:-workspace}"
KC_REALM="${KC_REALM:-workspace}"

# Keycloak-URL: extern über Ingress (curl läuft lokal, nicht im Pod)
# Dev: http://auth.localhost  |  Prod: https://auth.<domain>
if [[ "$ENV" == "dev" ]]; then
  KC_URL="http://auth.localhost"
else
  KC_URL="https://auth.${PROD_DOMAIN}"
fi

CONTEXT_FLAG=""
[ "$ENV" != "dev" ] && CONTEXT_FLAG="--context ${ENV_CONTEXT}"

# ── Colors ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[KC-SYNC]${NC} $*"; }
warn() { echo -e "${YELLOW}[KC-SYNC]${NC} $*"; }
err()  { echo -e "${RED}[KC-SYNC]${NC} $*"; }

# ── OIDC-Client-Mapping: K8s-Secret-Key → Keycloak clientId ──────────
declare -A CLIENT_MAP=(
  [NEXTCLOUD_OIDC_SECRET]="nextcloud"
  [DOCS_OIDC_SECRET]="docs"
  [VAULTWARDEN_OIDC_SECRET]="vaultwarden"
  [WEBSITE_OIDC_SECRET]="website"
  [CLAUDE_CODE_OIDC_SECRET]="claude-code"
)

# ── Warte auf Keycloak-Rollout ────────────────────────────────────────
log "Warte auf Keycloak-Rollout..."
# shellcheck disable=SC2086
if ! kubectl $CONTEXT_FLAG rollout status deployment/keycloak \
     -n "$KC_NAMESPACE" --timeout=120s 2>/dev/null; then
  warn "Keycloak nicht bereit — Sync wird übersprungen."
  exit 0
fi

# ── Admin-Token holen ─────────────────────────────────────────────────
# shellcheck disable=SC2086
KC_ADMIN_PASS=$(kubectl $CONTEXT_FLAG get secret workspace-secrets \
  -n "$KC_NAMESPACE" \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null \
  | base64 -d 2>/dev/null || echo "devadmin")

log "Hole Admin-Token von ${KC_URL}..."
# --data-urlencode escapes special chars (& # + =) that otherwise corrupt the form body.
ADMIN_TOKEN=$(curl -sk \
  -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "client_id=admin-cli" \
  --data-urlencode "username=admin" \
  --data-urlencode "password=${KC_ADMIN_PASS}" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || true)

if [[ -z "$ADMIN_TOKEN" ]]; then
  warn "Admin-Token nicht erhältlich — Sync wird übersprungen."
  warn "Hinweis: Admin-Passwort in workspace-secrets muss mit dem Passwort des 'admin'-Users im"
  warn "Keycloak-Realm 'master' übereinstimmen. Bei Drift: Passwort in Keycloak zurücksetzen"
  warn "(kcadm.sh set-password -r master --username admin --new-password \$NEU) oder"
  warn "workspace-secrets auf den alten Wert zurücksetzen."
  exit 0
fi

# ── Secrets aus workspace-secrets lesen und in Keycloak schreiben ─────
UPDATED=0
SKIPPED=0
FAILED=0

for SECRET_KEY in "${!CLIENT_MAP[@]}"; do
  CLIENT_ID="${CLIENT_MAP[$SECRET_KEY]}"

  # shellcheck disable=SC2086
  SECRET_VAL=$(kubectl $CONTEXT_FLAG get secret workspace-secrets \
    -n "$KC_NAMESPACE" \
    -o jsonpath="{.data.${SECRET_KEY}}" 2>/dev/null \
    | base64 -d 2>/dev/null || true)

  if [[ -z "$SECRET_VAL" ]]; then
    warn "  ${SECRET_KEY} nicht in workspace-secrets — Client '${CLIENT_ID}' übersprungen."
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Interne Keycloak-UUID des Clients ermitteln
  CLIENT_UUID=$(curl -sk \
    "${KC_URL}/admin/realms/${KC_REALM}/clients?clientId=${CLIENT_ID}&search=false" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [[ -z "$CLIENT_UUID" ]]; then
    warn "  Client '${CLIENT_ID}' nicht in Keycloak gefunden — übersprungen."
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Secret setzen via PUT /clients/{uuid} (POST /client-secret regeneriert statt zu setzen!)
  # Escape special chars for JSON string (backslash, double-quote).
  SECRET_JSON=$(printf '%s' "$SECRET_VAL" | sed 's/\\/\\\\/g; s/"/\\"/g')
  HTTP_STATUS=$(curl -sk \
    -o /dev/null -w "%{http_code}" \
    -X PUT "${KC_URL}/admin/realms/${KC_REALM}/clients/${CLIENT_UUID}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"${SECRET_JSON}\"}" || echo "000")

  if [[ "$HTTP_STATUS" =~ ^2 ]]; then
    log "  ✓ ${CLIENT_ID} (${SECRET_KEY})"
    UPDATED=$((UPDATED + 1))
  else
    err "  ✗ ${CLIENT_ID}: HTTP ${HTTP_STATUS}"
    FAILED=$((FAILED + 1))
  fi
done

# ── Zusammenfassung ───────────────────────────────────────────────────
echo ""
log "Sync abgeschlossen: ${UPDATED} aktualisiert, ${SKIPPED} übersprungen, ${FAILED} fehlgeschlagen."

if [[ $FAILED -gt 0 ]]; then
  warn "Einige Clients konnten nicht synchronisiert werden."
  warn "Manuelle Prüfung: task keycloak:sync-secrets ENV=${ENV}"
fi
