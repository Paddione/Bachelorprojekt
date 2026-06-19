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
#   bash scripts/keycloak-sync.sh korczewski   # positional brand arg
#   task keycloak:sync ENV=mentolder
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Fail-closed policy (offline-testable) ─────────────────────────────
# Non-dev runs (deploy step) must abort on an incomplete sync; dev stays soft.
# Soft-override KEYCLOAK_SYNC_SOFT=1 downgrades hard-fails to warnings (notfall).
kc_should_fail_closed() {
  [[ "${ENV:-dev}" != "dev" && "${KEYCLOAK_SYNC_SOFT:-0}" != "1" ]]
}
kc_skip_or_die() {  # $1 = human reason
  if kc_should_fail_closed; then
    echo -e "${RED}[KC-SYNC]${NC} FAIL (fail-closed): $1" >&2
    echo -e "${RED}[KC-SYNC]${NC} Override: KEYCLOAK_SYNC_SOFT=1 task keycloak:sync ENV=${ENV:-dev}" >&2
    exit 1
  fi
  echo -e "${YELLOW}[KC-SYNC]${NC} $1 — Sync wird übersprungen (dev/soft)." >&2
  exit 0
}

# Test seam: `source keycloak-sync.sh --_test-source` defines functions then returns
# before any cluster I/O, so BATS can unit-test the policy offline.
[[ "${1:-}" == "--_test-source" ]] && return 0 2>/dev/null || true

# ── Environment ───────────────────────────────────────────────────────
# ENV= env-var wins (Taskfile call site); fall back to a positional brand arg
# so `bash scripts/keycloak-sync.sh korczewski` resolves correctly (matches
# keycloak-ensure-mappers.sh / check-connectivity.sh). [T000405]
ENV="${ENV:-${1:-dev}}"
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
  kc_skip_or_die "Keycloak nicht bereit nach 5min"
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
  kc_skip_or_die "Keycloak HTTP-Endpunkt antwortet nicht"
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
  warn "Passwort-Drift erkannt: workspace-secrets-Passwort stimmt nicht mit dem live admin-User überein."
  warn "Lösung: task keycloak:sync-admin-password ENV=${ENV}"
  kc_skip_or_die "Admin-Token nicht erhältlich"
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
  # env:seal of workspace-secrets does NOT rotate it — co-rotate website-secrets separately.
  # shellcheck disable=SC2086
  _website_oidc=$(kubectl $CONTEXT_FLAG get secret website-secrets -n "${WEBSITE_NAMESPACE:-website}" \
    -o json 2>/dev/null \
    | jq -r '.data | to_entries[] | select(.key | endswith("_OIDC_SECRET")) | "\(.key)=\(.value|@base64d)"' 2>/dev/null || true)
  if [ -z "$_website_oidc" ]; then
    echo -e "${YELLOW}[KC-SYNC]${NC} WEBSITE_OIDC_SECRET aus website-secrets (ns ${WEBSITE_NAMESPACE:-website}) ist leer/missing — Website-SSO-Client wird NICHT mit-synchronisiert. Co-Rotation prüfen." >&2
  fi
  printf '%s\n' "$_website_oidc"
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

# ── Upsert realm groups from the template ─────────────────────────────
# Top-level groups only (none of the realms use subGroups). oauth2-proxy
# gates /recovery-access (and dev /brainstorm-access); the group must exist
# in Keycloak or members can't be assigned → 403-loop.
GROUPS_CREATED=0
GROUPS_SKIPPED=0
if [ "$TEMPLATE_AVAILABLE" -eq 1 ]; then
  while IFS= read -r RAW_GROUP; do
    [ -z "$RAW_GROUP" ] && continue
    GROUP_NAME=$(printf '%s' "$RAW_GROUP" | jq -r '.name')
    [ -z "$GROUP_NAME" ] || [ "$GROUP_NAME" = "null" ] && continue
    # Already present? (top-level lookup by exact name)
    EXISTING_GID=$(curl -sk \
      "${KC_URL}/admin/realms/${KC_REALM}/groups?search=${GROUP_NAME}&exact=true" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      | jq -r --arg n "$GROUP_NAME" '.[] | select(.name==$n) | .id' | head -1 || true)
    if [ -n "$EXISTING_GID" ]; then
      log "  ✓ group ${GROUP_NAME} (exists)"
      GROUPS_SKIPPED=$((GROUPS_SKIPPED + 1))
      continue
    fi
    HTTP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" \
      -X POST "${KC_URL}/admin/realms/${KC_REALM}/groups" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"${GROUP_NAME}\"}" || echo "000")
    if [[ "$HTTP_STATUS" =~ ^2 ]]; then
      log "  + group ${GROUP_NAME} (created)"
      GROUPS_CREATED=$((GROUPS_CREATED + 1))
    else
      err "  ✗ group ${GROUP_NAME}: POST failed HTTP ${HTTP_STATUS}"
      FAILED=$((FAILED + 1))
    fi
  done < <(kc_extract_groups_from_template "$REALM_TMP")
fi

# ── Zusammenfassung ───────────────────────────────────────────────────
echo ""
log "Sync abgeschlossen: ${CREATED} erstellt, ${SECRET_UPDATED} secret-aktualisiert, ${SKIPPED} übersprungen, ${GROUPS_CREATED} Gruppen erstellt, ${GROUPS_SKIPPED} Gruppen vorhanden, ${FAILED} fehlgeschlagen."

if [[ $FAILED -gt 0 ]]; then
  if kc_should_fail_closed; then
    err "FAIL (fail-closed): ${FAILED} Client(s)/Gruppe(n) konnten nicht synchronisiert werden."
    err "Override für Notfälle: KEYCLOAK_SYNC_SOFT=1 task keycloak:sync ENV=${ENV}"
    exit 1
  fi
  warn "Einige Clients konnten nicht synchronisiert werden (dev/soft)."
  warn "Manuelle Prüfung: task keycloak:sync ENV=${ENV}"
fi
