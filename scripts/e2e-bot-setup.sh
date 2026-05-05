#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# e2e-bot-setup.sh — Provision the e2e-bot user in Keycloak
#
# Creates (or updates) a single dedicated test user in the workspace realm,
# used only by Playwright e2e tests (sa-08-sso, OIDC flows). No realm-admin
# role — the auth-gated specs only need a logged-in workspace user.
#
# Usage:
#   E2E_BOT_PASSWORD=... ENV=mentolder bash scripts/e2e-bot-setup.sh
#   E2E_BOT_PASSWORD=... ENV=korczewski bash scripts/e2e-bot-setup.sh
#
# If E2E_BOT_PASSWORD is unset, the script generates a 32-char random
# password and prints it once on stdout — capture it for GH Actions secrets.
#
# Idempotent: re-runs update the password instead of duplicating users.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENV="${ENV:-dev}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"

KC_NAMESPACE="${KC_NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}"
KC_DEPLOY="${KC_DEPLOY:-keycloak}"
KC_SERVICE="${KC_SERVICE:-keycloak}"
KC_REALM="${KC_REALM:-workspace}"
KC_LOCAL_PORT="${KC_LOCAL_PORT:-18081}"  # +1 vs admin-users-setup.sh to avoid collision
KC_INTERNAL_URL="http://localhost:${KC_LOCAL_PORT}"
KC_CONTEXT="${ENV_CONTEXT:-}"

E2E_BOT_USERNAME="${E2E_BOT_USERNAME:-e2e-bot}"
E2E_BOT_EMAIL="${E2E_BOT_EMAIL:-e2e-bot@${PROD_DOMAIN:-localhost}}"
E2E_BOT_PASSWORD="${E2E_BOT_PASSWORD:-}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC}  $*" >&2; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*" >&2; }
err()  { echo -e "${RED}[ERR]${NC}   $*" >&2; exit 1; }

if [[ -z "$E2E_BOT_PASSWORD" ]]; then
  command -v openssl >/dev/null 2>&1 || err "openssl not found and E2E_BOT_PASSWORD not provided"
  # Realm policy requires upper/lower/digit/special; suffix guarantees all classes.
  E2E_BOT_PASSWORD="$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-28)Aa1!"
  log "Generated random password — capture it from the final output"
fi

KC_ADMIN_PASS=$(kubectl --context "$KC_CONTEXT" get secret workspace-secrets -n "$KC_NAMESPACE" \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null \
  | base64 -d 2>/dev/null || echo "")
[[ -z "$KC_ADMIN_PASS" ]] && err "Could not read KEYCLOAK_ADMIN_PASSWORD from $KC_NAMESPACE/workspace-secrets"

log "Waiting for Keycloak in $KC_NAMESPACE (context: $KC_CONTEXT)..."
kubectl --context "$KC_CONTEXT" rollout status deployment/"$KC_DEPLOY" -n "$KC_NAMESPACE" --timeout=120s >&2

log "Opening port-forward svc/${KC_SERVICE} → localhost:${KC_LOCAL_PORT}..."
kubectl --context "$KC_CONTEXT" port-forward -n "$KC_NAMESPACE" "svc/${KC_SERVICE}" "${KC_LOCAL_PORT}:8080" >/dev/null 2>&1 &
KC_PF_PID=$!
cleanup_pf() { kill "$KC_PF_PID" 2>/dev/null || true; wait "$KC_PF_PID" 2>/dev/null || true; }
trap cleanup_pf EXIT

for _ in $(seq 1 30); do
  curl -sf -o /dev/null "${KC_INTERNAL_URL}/realms/master/.well-known/openid-configuration" && break
  sleep 1
done

log "Obtaining admin token..."
# --data-urlencode each field: admin password may contain &, #, +, etc.
TOKEN_RESP=$(curl -s -o - -w "\n%{http_code}" \
  -X POST "${KC_INTERNAL_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "client_id=admin-cli" \
  --data-urlencode "username=admin" \
  --data-urlencode "password=${KC_ADMIN_PASS}")
TOKEN_HTTP="${TOKEN_RESP##*$'\n'}"
TOKEN_BODY="${TOKEN_RESP%$'\n'*}"
[[ "$TOKEN_HTTP" == "200" ]] || err "Token request failed (HTTP ${TOKEN_HTTP}): ${TOKEN_BODY:0:200}"
ADMIN_TOKEN=$(echo "$TOKEN_BODY" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)
[[ -z "$ADMIN_TOKEN" ]] && err "Empty access_token in response: ${TOKEN_BODY:0:200}"

existing_id=$(curl -sf \
  "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users?username=${E2E_BOT_USERNAME}&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

if [[ -n "$existing_id" ]]; then
  warn "User '${E2E_BOT_USERNAME}' exists (${existing_id}) — resetting password"
  curl -sf -X PUT \
    "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users/${existing_id}/reset-password" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"password\",\"value\":\"${E2E_BOT_PASSWORD}\",\"temporary\":false}" \
    -o /dev/null
  log "Password reset for '${E2E_BOT_USERNAME}'"
else
  log "Creating user '${E2E_BOT_USERNAME}'..."
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${E2E_BOT_USERNAME}\",
      \"email\": \"${E2E_BOT_EMAIL}\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"credentials\": [{\"type\":\"password\",\"value\":\"${E2E_BOT_PASSWORD}\",\"temporary\":false}]
    }")
  [[ "$http_code" == "201" ]] || err "Create user failed (HTTP ${http_code})"
  log "Created user '${E2E_BOT_USERNAME}'"
fi

# Print the password on stdout (one line) so callers can capture it.
# Everything else above goes to stderr.
echo "$E2E_BOT_PASSWORD"
