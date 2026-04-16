#!/usr/bin/env bash
# FA-11: Kunden-Portal — Infrastruktur und Keycloak-Integration
# Tests: Script vorhanden, Keycloak-Realm erreichbar, Website laeuft
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# ── T1: create-customer-guest.sh existiert und ist ausführbar ───
GUEST_SCRIPT="${SCRIPT_DIR}/../scripts/create-customer-guest.sh"
assert_eq "$(test -f "${GUEST_SCRIPT}" && echo "exists" || echo "missing")" "exists" \
  "FA-11" "T1a" "create-customer-guest.sh vorhanden"
assert_eq "$(test -x "${GUEST_SCRIPT}" && echo "executable" || echo "not-executable")" "executable" \
  "FA-11" "T1b" "create-customer-guest.sh ist ausführbar"

# ── T2: Keycloak workspace-Realm erreichbar ────────────────────
KC_READY=$(kubectl get deployment keycloak -n "$NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$KC_READY" 0 "FA-11" "T2" "Keycloak läuft (readyReplicas > 0)"

# ── T3: workspace-secrets enthält KEYCLOAK_ADMIN_PASSWORD ──────
KC_PASS=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null | base64 -d | wc -c | tr -d '[:space:]')
assert_gt "$KC_PASS" 0 "FA-11" "T3" "KEYCLOAK_ADMIN_PASSWORD in workspace-secrets gesetzt"

# ── T4: domain-config ConfigMap enthält KC_DOMAIN ───────────────
KC_DOMAIN=$(kubectl get configmap domain-config -n "$NAMESPACE" \
  -o jsonpath='{.data.KC_DOMAIN}' 2>/dev/null || echo "")
assert_contains "$KC_DOMAIN" "localhost" "FA-11" "T4" "KC_DOMAIN in domain-config gesetzt (${KC_DOMAIN})"

# ── T5: Website deployment running ────────────────────────────────
WEB_READY=$(kubectl get deployment website -n website \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WEB_READY" 0 "FA-11" "T5" "Website-Deployment laeuft (readyReplicas > 0)"
