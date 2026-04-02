#!/usr/bin/env bash
# FA-11: Kunden-Gast-Portal — Mattermost Gast-Account Infrastruktur
# Tests: Gast-Feature aktiviert, Script vorhanden, OIDC konfiguriert, Keycloak-Realm erreichbar
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"
WP_NAMESPACE="${WP_NAMESPACE:-wordpress}"

# ── T1: create-customer-guest.sh existiert und ist ausführbar ───
GUEST_SCRIPT="${SCRIPT_DIR}/../scripts/create-customer-guest.sh"
assert_eq "$(test -f "${GUEST_SCRIPT}" && echo "exists" || echo "missing")" "exists" \
  "FA-11" "T1a" "create-customer-guest.sh vorhanden"
assert_eq "$(test -x "${GUEST_SCRIPT}" && echo "executable" || echo "not-executable")" "executable" \
  "FA-11" "T1b" "create-customer-guest.sh ist ausführbar"

# ── T2: Mattermost Guest Accounts Feature aktiviert ─────────────
MM_READY=$(kubectl get deployment mattermost -n "$NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [[ "$MM_READY" -gt 0 ]]; then
  GUEST_ENABLED=$(kubectl exec -n "$NAMESPACE" deploy/mattermost -- \
    mmctl --local config get GuestAccountsSettings.Enable 2>/dev/null | grep -c "true" || echo "0")
  assert_gt "$GUEST_ENABLED" 0 "FA-11" "T2" "Mattermost GuestAccountsSettings.Enable = true"
else
  skip_test "FA-11" "T2" "Mattermost Guest Feature" "Mattermost nicht bereit"
fi

# ── T3: system_guest Rolle in Mattermost vorhanden ──────────────
if [[ "$MM_READY" -gt 0 ]]; then
  GUEST_ROLE=$(kubectl exec -n "$NAMESPACE" deploy/mattermost -- \
    mmctl --local roles show system_guest 2>/dev/null | grep -c "system_guest" || echo "0")
  assert_gt "$GUEST_ROLE" 0 "FA-11" "T3" "Mattermost system_guest Rolle vorhanden"
else
  skip_test "FA-11" "T3" "system_guest Rolle" "Mattermost nicht bereit"
fi

# ── T4: Keycloak homeoffice-Realm erreichbar ────────────────────
KC_READY=$(kubectl get deployment keycloak -n "$NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$KC_READY" 0 "FA-11" "T4" "Keycloak läuft (readyReplicas > 0)"

# ── T5: homeoffice-secrets enthält KEYCLOAK_ADMIN_PASSWORD ──────
KC_PASS=$(kubectl get secret homeoffice-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' 2>/dev/null | base64 -d | wc -c | tr -d '[:space:]')
assert_gt "$KC_PASS" 0 "FA-11" "T5" "KEYCLOAK_ADMIN_PASSWORD in homeoffice-secrets gesetzt"

# ── T6: domain-config ConfigMap enthält KC_DOMAIN ───────────────
KC_DOMAIN=$(kubectl get configmap domain-config -n "$NAMESPACE" \
  -o jsonpath='{.data.KC_DOMAIN}' 2>/dev/null || echo "")
assert_contains "$KC_DOMAIN" "localhost" "FA-11" "T6" "KC_DOMAIN in domain-config gesetzt (${KC_DOMAIN})"

# ── T7: WordPress OIDC Secret gesetzt (kein Platzhalter) ─────────
WP_OIDC_SECRET=$(kubectl get secret wordpress-oidc-secret -n "$WP_NAMESPACE" \
  -o jsonpath='{.data.client-secret}' 2>/dev/null | base64 -d | tr -d '[:space:]' || echo "")
if [[ -n "$WP_OIDC_SECRET" ]]; then
  assert_eq "$(echo "$WP_OIDC_SECRET" | grep -c "REPLACE_ME" || echo "0")" "0" \
    "FA-11" "T7" "WordPress OIDC-Secret ist kein Platzhalter"
else
  skip_test "FA-11" "T7" "WordPress OIDC Secret" "Secret nicht gefunden (Namespace: ${WP_NAMESPACE})"
fi

# ── T8: WordPress OIDC Plugin konfiguriert ───────────────────────
WP_READY=$(kubectl get deployment wordpress -n "$WP_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [[ "$WP_READY" -gt 0 ]]; then
  OIDC_OPTION=$(kubectl exec -n "$WP_NAMESPACE" deploy/wordpress -- \
    wp --allow-root option get openid_connect_generic_settings 2>/dev/null | grep -c "endpoint" || echo "0")
  assert_gt "$OIDC_OPTION" 0 "FA-11" "T8" "WordPress OIDC-Einstellungen konfiguriert (openid_connect_generic_settings)"
else
  skip_test "FA-11" "T8" "WordPress OIDC Konfiguration" "WordPress nicht bereit"
fi
