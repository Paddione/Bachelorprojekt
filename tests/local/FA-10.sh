#!/usr/bin/env bash
# FA-10: Kundenanfragen-Kontaktformular — CF7 + Mattermost Webhook
# Tests: WordPress/CF7 plugins active, Anfragen channels exist, webhook reachable
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WP_NAMESPACE="${WP_NAMESPACE:-wordpress}"
MM_NAMESPACE="${NAMESPACE:-homeoffice}"

# ── T1: WordPress pod läuft ──────────────────────────────────────
WP_READY=$(kubectl get deployment wordpress -n "$WP_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WP_READY" 0 "FA-10" "T1" "WordPress-Deployment läuft (readyReplicas > 0)"

# ── T2: MariaDB pod läuft ────────────────────────────────────────
DB_READY=$(kubectl get deployment mariadb -n "$WP_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$DB_READY" 0 "FA-10" "T2" "MariaDB-Deployment läuft"

# ── T3: Contact Form 7 Plugin aktiv ─────────────────────────────
if [[ "$WP_READY" -gt 0 ]]; then
  CF7_STATUS=$(kubectl exec -n "$WP_NAMESPACE" deploy/wordpress -- \
    wp --allow-root plugin status contact-form-7 2>/dev/null | grep -i "Status:" | awk '{print $2}')
  assert_eq "$CF7_STATUS" "Active" "FA-10" "T3" "Contact Form 7 Plugin aktiv"
else
  skip_test "FA-10" "T3" "CF7 Plugin-Status" "WordPress nicht bereit"
fi

# ── T4: CF7-to-Webhook Plugin aktiv ─────────────────────────────
if [[ "$WP_READY" -gt 0 ]]; then
  ZAPIER_STATUS=$(kubectl exec -n "$WP_NAMESPACE" deploy/wordpress -- \
    wp --allow-root plugin status cf7-to-zapier 2>/dev/null | grep -i "Status:" | awk '{print $2}')
  assert_eq "$ZAPIER_STATUS" "Active" "FA-10" "T4" "CF7-to-Webhook Plugin (cf7-to-zapier) aktiv"
else
  skip_test "FA-10" "T4" "CF7-to-Webhook Plugin-Status" "WordPress nicht bereit"
fi

# ── T5: OIDC Plugin aktiv ────────────────────────────────────────
if [[ "$WP_READY" -gt 0 ]]; then
  OIDC_STATUS=$(kubectl exec -n "$WP_NAMESPACE" deploy/wordpress -- \
    wp --allow-root plugin status daggerhart-openid-connect-generic 2>/dev/null | grep -i "Status:" | awk '{print $2}')
  assert_eq "$OIDC_STATUS" "Active" "FA-10" "T5" "Keycloak OIDC Plugin aktiv"
else
  skip_test "FA-10" "T5" "OIDC Plugin-Status" "WordPress nicht bereit"
fi

# ── T6: Anfragen-Kanal in mind. einem Team vorhanden ────────────
ANFRAGEN_COUNT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
  mmctl --local channel list --all 2>/dev/null | grep -c "anfragen" || echo "0")
assert_gt "$ANFRAGEN_COUNT" 0 "FA-10" "T6" "Anfragen-Kanal in mind. einem Mattermost-Team vorhanden"

# ── T7: Incoming Webhook vorhanden ───────────────────────────────
TOKEN_OUT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
  mmctl --local token generate sysadmin wh-check 2>/dev/null || echo "")
MM_TMP_TOKEN=$(echo "$TOKEN_OUT" | awk -F: '{print $1}' | tr -d '[:space:]')
if [[ -n "$MM_TMP_TOKEN" && ${#MM_TMP_TOKEN} -gt 10 ]]; then
  WH_COUNT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
    curl -sf -H "Authorization: Bearer ${MM_TMP_TOKEN}" \
    "http://localhost:8065/api/v4/hooks/incoming?per_page=50" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
  kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
    mmctl --local token revoke "$MM_TMP_TOKEN" 2>/dev/null || true
  assert_gt "$WH_COUNT" 0 "FA-10" "T7" "Mattermost Incoming Webhook vorhanden (${WH_COUNT})"
else
  skip_test "FA-10" "T7" "Incoming Webhook vorhanden" "Token-Generierung fehlgeschlagen"
fi

# ── T8: WordPress Site-URL korrekt ──────────────────────────────
if [[ "$WP_READY" -gt 0 ]]; then
  SITE_URL=$(kubectl exec -n "$WP_NAMESPACE" deploy/wordpress -- \
    wp --allow-root option get siteurl 2>/dev/null | tr -d '[:space:]')
  assert_contains "$SITE_URL" "wbhprojekt.ipv64.de" "FA-10" "T8" "WordPress Site-URL korrekt (${SITE_URL})"
else
  skip_test "FA-10" "T8" "WordPress Site-URL" "WordPress nicht bereit"
fi

# ── T9: Mind. ein CF7-Formular vorhanden ────────────────────────
if [[ "$WP_READY" -gt 0 ]]; then
  FORM_COUNT=$(kubectl exec -n "$WP_NAMESPACE" deploy/wordpress -- \
    wp --allow-root post list --post_type=wpcf7_contact_form \
    --fields=ID --format=count 2>/dev/null || echo "0")
  assert_gt "$FORM_COUNT" 0 "FA-10" "T9" "Mind. ein CF7-Kontaktformular angelegt"
else
  skip_test "FA-10" "T9" "CF7 Formular vorhanden" "WordPress nicht bereit"
fi
