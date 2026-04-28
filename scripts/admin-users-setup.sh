#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# admin-users-setup.sh — Provision SSO admin users in Keycloak
#
# Creates KC_USER1 and KC_USER2 (from .env) in the workspace realm.
# Safe to re-run — existing users are updated, not duplicated.
#
# Usage:  bash scripts/admin-users-setup.sh
#         ENV=mentolder bash scripts/admin-users-setup.sh
#         task workspace:admin-users-setup
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load environment config ───────────────────────────────────────────
# Accepts ENV= parameter (default: dev) to resolve variables from environments/
ENV="${ENV:-dev}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"

# ── Config ─────────────────────────────────────────────────────────────
KC_NAMESPACE="${KC_NAMESPACE:-workspace}"
KC_DEPLOY="${KC_DEPLOY:-keycloak}"
KC_REALM="${KC_REALM:-workspace}"
KC_INTERNAL_URL="http://keycloak.${KC_NAMESPACE}.svc.cluster.local:8080"

# Read admin password from Kubernetes secret (production) or fall back to dev default
KC_ADMIN_PASS=$(kubectl get secret workspace-secrets -n "$KC_NAMESPACE" \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null \
  | base64 -d 2>/dev/null || echo "devadmin")

# ── Colors ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

# ── Validate required vars ─────────────────────────────────────────────
: "${KC_USER1_USERNAME:?KC_USER1_USERNAME not set — check environments/${ENV}.yaml}"
: "${KC_USER1_EMAIL:?KC_USER1_EMAIL not set — check environments/${ENV}.yaml}"
: "${KC_USER1_PASSWORD:?KC_USER1_PASSWORD not set — check environments/${ENV}.yaml}"
# KC_USER2_* is optional — provisioned only when all three vars are set.
KC_USER2_USERNAME="${KC_USER2_USERNAME:-}"
KC_USER2_EMAIL="${KC_USER2_EMAIL:-}"
KC_USER2_PASSWORD="${KC_USER2_PASSWORD:-}"

# ── Wait for Keycloak ──────────────────────────────────────────────────
log "Waiting for Keycloak to be ready..."
kubectl rollout status deployment/"$KC_DEPLOY" -n "$KC_NAMESPACE" --timeout=120s

# ── Helper: run curl inside Keycloak pod ──────────────────────────────
_kc_curl() {
  kubectl exec -n "$KC_NAMESPACE" deploy/"$KC_DEPLOY" -- \
    curl -sf "$@"
}

# ── Get admin token ────────────────────────────────────────────────────
log "Obtaining Keycloak admin token..."
ADMIN_TOKEN=$(_kc_curl \
  -X POST "${KC_INTERNAL_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=${KC_ADMIN_PASS}" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

[[ -z "$ADMIN_TOKEN" ]] && err "Failed to obtain admin token — check KEYCLOAK_ADMIN_PASSWORD"

log "Admin token obtained."

# ── Helper: upsert a user ──────────────────────────────────────────────
upsert_user() {
  local username="$1" email="$2" password="$3"

  # Check if user exists
  local existing_id
  existing_id=$(_kc_curl \
    "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users?username=${username}&exact=true" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [[ -n "$existing_id" ]]; then
    warn "User '${username}' already exists (${existing_id}) — updating password"
    # Update password
    _kc_curl -X PUT \
      "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users/${existing_id}/reset-password" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"password\",\"value\":\"${password}\",\"temporary\":false}" \
      -o /dev/null
    log "  Password updated for '${username}'"
    return 0
  fi

  # Create user
  local http_code
  http_code=$(_kc_curl -o /dev/null -w "%{http_code}" \
    -X POST "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${username}\",
      \"email\": \"${email}\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"credentials\": [{\"type\":\"password\",\"value\":\"${password}\",\"temporary\":false}]
    }")

  if [[ "$http_code" == "201" ]]; then
    log "  Created user '${username}' (${email})"
  else
    err "  Failed to create user '${username}' — HTTP ${http_code}"
  fi

  # Assign realm-admin role
  local user_id
  user_id=$(_kc_curl \
    "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users?username=${username}&exact=true" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  # Get admin role representation from realm
  local role_json
  role_json=$(_kc_curl \
    "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/roles/admin" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" 2>/dev/null || echo "")

  if [[ -n "$role_json" && -n "$user_id" ]]; then
    _kc_curl -X POST \
      "${KC_INTERNAL_URL}/admin/realms/${KC_REALM}/users/${user_id}/role-mappings/realm" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "[${role_json}]" -o /dev/null 2>/dev/null || true
    log "  Assigned realm admin role to '${username}'"
  fi
}

# ── Provision users ────────────────────────────────────────────────────
echo ""
log "Provisioning SSO admin users in realm '${KC_REALM}'..."

upsert_user "$KC_USER1_USERNAME" "$KC_USER1_EMAIL" "$KC_USER1_PASSWORD"
if [[ -n "$KC_USER2_USERNAME" && -n "$KC_USER2_EMAIL" && -n "$KC_USER2_PASSWORD" ]]; then
  upsert_user "$KC_USER2_USERNAME" "$KC_USER2_EMAIL" "$KC_USER2_PASSWORD"
else
  warn "KC_USER2_* not set in environments/${ENV}.yaml — skipping second admin user"
fi

echo ""
log "═══════════════════════════════════════════"
log "  SSO admin users provisioned"
log "  User 1: ${KC_USER1_USERNAME} (${KC_USER1_EMAIL})"
if [[ -n "$KC_USER2_USERNAME" ]]; then
  log "  User 2: ${KC_USER2_USERNAME} (${KC_USER2_EMAIL})"
fi
log "  Realm:  ${KC_REALM}"
log "═══════════════════════════════════════════"
