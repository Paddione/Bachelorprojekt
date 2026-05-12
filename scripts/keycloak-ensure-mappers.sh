#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# keycloak-ensure-mappers.sh — Idempotent upsert of protocol mappers
# that keycloak-sync.sh's secret-only PUT does NOT cover.
#
# Currently ensures:
#   - website client → "audience-arena" oidc-audience-mapper
#     (so user session tokens carry aud=arena and the arena-server's
#      audience check passes without token-exchange).
#
# Usage:
#   ENV=mentolder bash scripts/keycloak-ensure-mappers.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENV="${ENV:-dev}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"

KC_NAMESPACE="${KC_NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}"
KC_REALM="${KC_REALM:-workspace}"

if [[ "$ENV" == "dev" ]]; then
  KC_URL="http://auth.localhost"
else
  KC_URL="https://auth.${PROD_DOMAIN}"
fi

CONTEXT_FLAG=""
[[ "$ENV" != "dev" ]] && CONTEXT_FLAG="--context ${ENV_CONTEXT}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[KC-MAPPER]${NC} $*"; }
warn() { echo -e "${YELLOW}[KC-MAPPER]${NC} $*"; }
err()  { echo -e "${RED}[KC-MAPPER]${NC} $*"; }

# ── Admin-Token ──────────────────────────────────────────────────────
# shellcheck disable=SC2086
KC_ADMIN_PASS=$(kubectl $CONTEXT_FLAG get secret workspace-secrets \
  -n "$KC_NAMESPACE" \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null \
  | base64 -d 2>/dev/null || echo "devadmin")

log "Hole Admin-Token von ${KC_URL}..."
ADMIN_TOKEN=$(curl -sk \
  -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "client_id=admin-cli" \
  --data-urlencode "username=admin" \
  --data-urlencode "password=${KC_ADMIN_PASS}" \
  | jq -r '.access_token // empty')

if [[ -z "$ADMIN_TOKEN" ]]; then
  err "Admin-Token konnte nicht geholt werden — Abbruch."
  exit 1
fi

# ── ensure_audience_mapper CLIENT_ID NAME AUD ────────────────────────
ensure_audience_mapper() {
  local client_id="$1"
  local mapper_name="$2"
  local audience="$3"

  local client_uuid
  client_uuid=$(curl -sk \
    "${KC_URL}/admin/realms/${KC_REALM}/clients?clientId=${client_id}&search=false" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | jq -r '.[0].id // empty')

  if [[ -z "$client_uuid" ]]; then
    err "  ✗ Client '${client_id}' nicht gefunden im Realm '${KC_REALM}'."
    return 1
  fi

  local existing
  existing=$(curl -sk \
    "${KC_URL}/admin/realms/${KC_REALM}/clients/${client_uuid}/protocol-mappers/models" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | jq -r ".[] | select(.name==\"${mapper_name}\") | .id // empty")

  local body
  body=$(jq -n \
    --arg name "$mapper_name" \
    --arg aud  "$audience" \
    '{name: $name, protocol: "openid-connect", protocolMapper: "oidc-audience-mapper",
      consentRequired: false,
      config: { "included.client.audience": $aud,
                "access.token.claim": "true",
                "id.token.claim": "false" }}')

  if [[ -n "$existing" ]]; then
    local status
    status=$(curl -sk -o /dev/null -w "%{http_code}" \
      -X PUT "${KC_URL}/admin/realms/${KC_REALM}/clients/${client_uuid}/protocol-mappers/models/${existing}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$(echo "$body" | jq --arg id "$existing" '. + {id: $id}')")
    if [[ "$status" =~ ^2 ]]; then
      log "  ✓ ${client_id} / ${mapper_name} (updated, aud=${audience})"
    else
      err "  ✗ ${client_id} / ${mapper_name}: PUT HTTP ${status}"
      return 1
    fi
  else
    local status
    status=$(curl -sk -o /dev/null -w "%{http_code}" \
      -X POST "${KC_URL}/admin/realms/${KC_REALM}/clients/${client_uuid}/protocol-mappers/models" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body")
    if [[ "$status" =~ ^2 ]]; then
      log "  + ${client_id} / ${mapper_name} (created, aud=${audience})"
    else
      err "  ✗ ${client_id} / ${mapper_name}: POST HTTP ${status}"
      return 1
    fi
  fi
}

log "Stelle Protocol-Mapper im Realm '${KC_REALM}' sicher..."
ensure_audience_mapper "website" "audience-arena" "arena"

log "Fertig."
