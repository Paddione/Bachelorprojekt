#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# keycloak-sync.sh — Sync OIDC clients + secrets → Keycloak Admin API
#
# workspace-secrets ist die einzige Wahrheitsquelle für OIDC-Secrets.
# Dieses Script liest alle *_OIDC_SECRET-Werte aus dem K8s-Secret und
# schreibt sie per Admin REST API in die Keycloak-Datenbank.
# Idempotent — kann jederzeit mehrfach ausgeführt werden.
#
# Usage:
#   bash scripts/keycloak-sync.sh
#   ENV=mentolder bash scripts/keycloak-sync.sh
#   task keycloak:sync ENV=mentolder
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Environment ───────────────────────────────────────────────────────
ENV="${ENV:-dev}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/keycloak-helpers.sh"

KC_NAMESPACE="${KC_NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}"
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

# ── Warte auf Keycloak-Rollout ────────────────────────────────────────
log "Warte auf Keycloak-Rollout..."
# shellcheck disable=SC2086
if ! kubectl $CONTEXT_FLAG rollout status deployment/keycloak \
     -n "$KC_NAMESPACE" --timeout=300s 2>/dev/null; then
  warn "Keycloak nicht bereit nach 5min — Sync wird übersprungen."
  exit 0
fi

# Rollout abgeschlossen, aber der Admin-API-Endpunkt braucht ggf. noch
# einen Moment. Warte bis zu 60s darauf, dass /realms/master HTTP 200 liefert.
log "Warte auf Keycloak HTTP-Bereitschaft..."
KC_READY=0
for _i in $(seq 1 12); do
  if curl -sk --max-time 5 "${KC_URL}/realms/master" | grep -q '"realm"'; then
    KC_READY=1
    break
  fi
  sleep 5
done
if [[ $KC_READY -eq 0 ]]; then
  warn "Keycloak HTTP-Endpunkt antwortet nicht — Sync wird übersprungen."
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

# ── Realm-Template ConfigMap ─────────────────────────────────────────
REALM_TMP=$(mktemp)
trap 'rm -f "$REALM_TMP"' EXIT

# shellcheck disable=SC2086
if ! kubectl $CONTEXT_FLAG get cm realm-template -n "$KC_NAMESPACE" \
     -o jsonpath='{.data.realm-workspace\.json}' > "$REALM_TMP" 2>/dev/null \
   || [ ! -s "$REALM_TMP" ]; then
  warn "realm-template ConfigMap nicht gefunden — kann keine Clients aus Template lesen."
  warn "Fallback: reiner Secret-Sync-Modus (nur PUT für existierende Clients)."
  TEMPLATE_AVAILABLE=0
else
  TEMPLATE_AVAILABLE=1
fi

# ── Build KV map for ${VAR} substitution ─────────────────────────────
# Domain vars come from configmap/domain-config (same keys the pod sees).
# Secret vars (*_OIDC_SECRET) come from secret/workspace-secrets.
build_kv_map() {
  # shellcheck disable=SC2086
  kubectl $CONTEXT_FLAG get cm domain-config -n "$KC_NAMESPACE" \
    -o jsonpath='{range .data}{@}{end}' 2>/dev/null \
    | jq -r 'to_entries[] | "\(.key)=\(.value)"' 2>/dev/null || true

  # shellcheck disable=SC2086
  kubectl $CONTEXT_FLAG get secret workspace-secrets -n "$KC_NAMESPACE" \
    -o json 2>/dev/null \
    | jq -r '.data | to_entries[] | select(.key | endswith("_OIDC_SECRET")) | "\(.key)=\(.value|@base64d)"' 2>/dev/null || true

  # WEBSITE_OIDC_SECRET lives in website-secrets (website namespace), not workspace-secrets.
  # shellcheck disable=SC2086
  kubectl $CONTEXT_FLAG get secret website-secrets -n "${WEBSITE_NAMESPACE:-website}" \
    -o json 2>/dev/null \
    | jq -r '.data | to_entries[] | select(.key | endswith("_OIDC_SECRET")) | "\(.key)=\(.value|@base64d)"' 2>/dev/null || true
}

KV_MAP=$(build_kv_map)
if [ -z "$KV_MAP" ]; then
  warn "KV-Map leer — domain-config oder workspace-secrets nicht lesbar."
  exit 0
fi

# ── Upsert clients from the realm template ───────────────────────────
CREATED=0
SECRET_UPDATED=0
SKIPPED=0
FAILED=0

if [ "$TEMPLATE_AVAILABLE" -eq 1 ]; then
  while IFS= read -r RAW_CLIENT; do
    [ -z "$RAW_CLIENT" ] && continue

    CLIENT_ID=$(printf '%s' "$RAW_CLIENT" | jq -r '.clientId')
    SUBBED=$(kc_substitute_placeholders "$RAW_CLIENT" "$KV_MAP")

    if ! kc_assert_no_placeholders "$SUBBED" > /dev/null 2>&1; then
      err "  ✗ ${CLIENT_ID}: unresolved placeholders after substitution — skipping."
      kc_assert_no_placeholders "$SUBBED" 2>&1 | sed 's/^/      /' || true
      FAILED=$((FAILED + 1))
      continue
    fi

    # Does the client already exist?
    EXISTING_UUID=$(curl -sk \
      "${KC_URL}/admin/realms/${KC_REALM}/clients?clientId=${CLIENT_ID}&search=false" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

    if [ -z "$EXISTING_UUID" ]; then
      # Create missing client
      HTTP_STATUS=$(curl -sk \
        -o /dev/null -w "%{http_code}" \
        -X POST "${KC_URL}/admin/realms/${KC_REALM}/clients" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$SUBBED" || echo "000")
      if [[ "$HTTP_STATUS" =~ ^2 ]]; then
        log "  + ${CLIENT_ID} (created)"
        CREATED=$((CREATED + 1))
      else
        err "  ✗ ${CLIENT_ID}: POST failed HTTP ${HTTP_STATUS}"
        FAILED=$((FAILED + 1))
      fi
    else
      # Secret-only reconciliation (presence-only policy — see design spec §3)
      SECRET_VAL=$(printf '%s' "$SUBBED" | jq -r '.secret // empty')
      if [ -z "$SECRET_VAL" ]; then
        warn "  ${CLIENT_ID}: kein .secret nach Substitution — übersprungen."
        SKIPPED=$((SKIPPED + 1))
        continue
      fi
      SECRET_JSON=$(printf '%s' "$SECRET_VAL" | sed 's/\\/\\\\/g; s/"/\\"/g')
      HTTP_STATUS=$(curl -sk \
        -o /dev/null -w "%{http_code}" \
        -X PUT "${KC_URL}/admin/realms/${KC_REALM}/clients/${EXISTING_UUID}" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"secret\":\"${SECRET_JSON}\"}" || echo "000")
      if [[ "$HTTP_STATUS" =~ ^2 ]]; then
        log "  ✓ ${CLIENT_ID} (secret-updated)"
        SECRET_UPDATED=$((SECRET_UPDATED + 1))
      else
        err "  ✗ ${CLIENT_ID}: PUT secret failed HTTP ${HTTP_STATUS}"
        FAILED=$((FAILED + 1))
      fi
    fi
  done < <(kc_extract_clients_from_template "$REALM_TMP")
else
  warn "TEMPLATE_AVAILABLE=0 — skipping template-driven upsert (no ConfigMap)."
fi

# ── Zusammenfassung ───────────────────────────────────────────────────
echo ""
log "Sync abgeschlossen: ${CREATED} erstellt, ${SECRET_UPDATED} secret-aktualisiert, ${SKIPPED} übersprungen, ${FAILED} fehlgeschlagen."

if [[ $FAILED -gt 0 ]]; then
  warn "Einige Clients konnten nicht synchronisiert werden."
  warn "Manuelle Prüfung: task keycloak:sync ENV=${ENV}"
fi
