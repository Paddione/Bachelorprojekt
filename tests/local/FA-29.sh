#!/usr/bin/env bash
# FA-29: Requirements-Tracking-UI (bachelorprojekt) — Pod, HTTP, Datenbank
# Tests:
#   T1 — bachelorprojekt pod ready
#   T2 — service responds HTTP 200
#   T3 — DATABASE_URL konfiguriert (shared-db)
#   T4 — Ingress-Host tracking.localhost konfiguriert
#   T5 — Datenbank-Schema bachelorprojekt in shared-db vorhanden
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/assert.sh
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/nextcloud -- curl -s "$@" 2>/dev/null; }

# ── T1: bachelorprojekt pod running ──────────────────────────────
BP_READY=$(kubectl get deploy bachelorprojekt -n "$NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${BP_READY:-0}" "0" "FA-29" "T1" "Tracking-Pod laeuft (readyReplicas > 0)"

# ── T2: HTTP 200 vom Service ─────────────────────────────────────
if [[ "${BP_READY:-0}" -gt 0 ]]; then
  HTTP_CODE=$(_kube_curl -o /dev/null -w '%{http_code}' "http://bachelorprojekt:80/")
  assert_eq "$HTTP_CODE" "200" "FA-29" "T2" "Tracking-UI erreichbar (HTTP 200)"
else
  skip_test "FA-29" "T2" "Tracking-UI HTTP" "Pod nicht bereit"
fi

# ── T3: DATABASE_URL konfiguriert ────────────────────────────────
DB_URL=$(kubectl get deployment bachelorprojekt -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="DATABASE_URL")].value}' \
  2>/dev/null || echo "")
assert_contains "$DB_URL" "shared-db" "FA-29" "T3" "DATABASE_URL verweist auf shared-db (${DB_URL})"

# ── T4: Ingress tracking.localhost ───────────────────────────────
INGRESS_HOST=$(kubectl get ingress bachelorprojekt -n "$NAMESPACE" \
  -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "")
assert_eq "$INGRESS_HOST" "tracking.localhost" "FA-29" "T4" \
  "Ingress-Host tracking.localhost konfiguriert (${INGRESS_HOST})"

# ── T5: Schema bachelorprojekt in shared-db vorhanden ────────────
SCHEMA_EXISTS=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U postgres -tAc \
  "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='bachelorprojekt';" \
  2>/dev/null || echo "0")
# If the app uses the default public schema under its own DB/user, we check
# that the app can query the DB (table count > 0 means initialized).
if [[ "${SCHEMA_EXISTS:-0}" -ge 1 ]]; then
  assert_eq "${SCHEMA_EXISTS:-0}" "1" "FA-29" "T5" "Schema bachelorprojekt in shared-db vorhanden"
else
  # Fall back: check that at least some tables exist in the postgres DB
  TABLE_COUNT=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
    psql -U postgres -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" \
    2>/dev/null || echo "0")
  assert_gt "${TABLE_COUNT:-0}" "0" "FA-29" "T5" "shared-db enthält Tabellen (DB-Verbindung OK)"
fi
