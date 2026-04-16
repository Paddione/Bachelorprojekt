#!/usr/bin/env bash
# FA-23: Vaultwarden Passwort-Manager — Deployment, SSO, Seed, Database
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/keycloak -- curl -s "$@" 2>/dev/null; }

# ── T1: Vaultwarden pod running ─────────────────────────────────
VW_READY=$(kubectl get deploy vaultwarden -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${VW_READY:-0}" "0" "FA-23" "T1" "Vaultwarden-Pod running (readyReplicas > 0)"

# ── T2: Vaultwarden /alive health endpoint ──────────────────────
VW_HEALTH=$(_kube_curl -o /dev/null -w '%{http_code}' "http://vaultwarden:80/alive")
assert_eq "$VW_HEALTH" "200" "FA-23" "T2" "Vaultwarden /alive erreichbar (HTTP 200)"

# ── T3: Vaultwarden database exists in shared-db ────────────────
VW_DB=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='vaultwarden'" 2>/dev/null | tr -d '[:space:]')
assert_eq "$VW_DB" "1" "FA-23" "T3" "Vaultwarden-Datenbank in shared-db vorhanden"

# ── T4: SSO enabled in Vaultwarden config ───────────────────────
SSO_ENABLED=$(kubectl get deploy vaultwarden -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null \
  | jq -r '.[] | select(.name=="SSO_ENABLED") | .value // "false"')
assert_eq "$SSO_ENABLED" "true" "FA-23" "T4" "SSO in Vaultwarden aktiviert"

# ── T5: Vaultwarden service on port 80 ──────────────────────────
VW_SVC=$(kubectl get svc vaultwarden -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "0")
assert_eq "$VW_SVC" "80" "FA-23" "T5" "Vaultwarden Service auf Port 80"

# ── T6: Vaultwarden PVC bound ───────────────────────────────────
VW_PVC=$(kubectl get pvc vaultwarden-data-pvc -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
assert_eq "$VW_PVC" "Bound" "FA-23" "T6" "Vaultwarden PVC gebunden"

# ── T7: Vaultwarden uses Keycloak OIDC authority ────────────────
SSO_AUTHORITY=$(kubectl get deploy vaultwarden -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null \
  | jq -r '.[] | select(.name=="SSO_AUTHORITY") | .value // ""')
assert_contains "$SSO_AUTHORITY" "keycloak" "FA-23" "T7" "SSO-Authority zeigt auf Keycloak"

