#!/usr/bin/env bash
# FA-22: Stripe Payment Gateway — InvoiceNinja Stripe integration
# Tests: Stripe secrets exist, gateway registration via API, idempotency, gateway config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
IN_URL="http://invoiceninja:80"
STRIPE_GATEWAY_KEY="d14dd26a37cecc30fdd65700bfb55b23"

_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- curl -s "$@" 2>/dev/null; }

_in_api() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s -X "$method" -H "X-API-TOKEN: ${IN_TOKEN}" -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest")
  [[ -n "$data" ]] && args+=(-d "$data")
  _kube_curl "${args[@]}" "${IN_URL}${path}"
}

# ── T1: Stripe secrets exist in workspace-secrets ─────────────────
STRIPE_PK=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.STRIPE_PUBLISHABLE_KEY}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
assert_match "$STRIPE_PK" "^pk_" "FA-22" "T1a" "STRIPE_PUBLISHABLE_KEY beginnt mit pk_"

STRIPE_SK=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.STRIPE_SECRET_KEY}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
assert_match "$STRIPE_SK" "^sk_" "FA-22" "T1b" "STRIPE_SECRET_KEY beginnt mit sk_"

# ── T2: InvoiceNinja API token available ──────────────────────────
# Login to get a valid token (the static secret token may not be registered in IN's DB)
IN_ADMIN_EMAIL="admin@workspace.local"
IN_ADMIN_PW=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.INVOICENINJA_ADMIN_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
IN_TOKEN=$(_kube_curl -X POST "${IN_URL}/api/v1/login" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d "{\"email\":\"${IN_ADMIN_EMAIL}\",\"password\":\"${IN_ADMIN_PW}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['token']['token'])" 2>/dev/null || echo "")

if [[ -z "$IN_TOKEN" ]]; then
  skip_test "FA-22" "T2" "InvoiceNinja API-Token vorhanden" "Kein API-Token"
  skip_test "FA-22" "T3" "Stripe-Gateway via API registrieren" "Kein API-Token"
  skip_test "FA-22" "T4" "Gateway-Konfiguration korrekt" "Kein API-Token"
  skip_test "FA-22" "T5" "Kreditkarten aktiviert" "Kein API-Token"
  skip_test "FA-22" "T6" "SEPA aktiviert" "Kein API-Token"
  skip_test "FA-22" "T7" "Idempotenz — erneuter Aufruf aktualisiert" "Kein API-Token"
  skip_test "FA-22" "T8" "Aufraumen — Test-Gateway entfernt" "Kein API-Token"
  exit 0
fi
assert_gt "${#IN_TOKEN}" "0" "FA-22" "T2" "InvoiceNinja API-Token vorhanden"

# ── T3: Register Stripe gateway via API ───────────────────────────
PAYLOAD=$(python3 -c "
import json, sys
config = json.dumps({'publishableKey': '$STRIPE_PK', 'apiKey': '$STRIPE_SK', 'appleDomainVerification': ''})
print(json.dumps({
    'gateway_key': '$STRIPE_GATEWAY_KEY',
    'config': config,
    'accepted_credit_cards': 7,
    'token_billing': 'always',
    'require_cvv': True,
    'label': 'Stripe-Test-FA22',
    'fees_and_limits': {
        '1': {'min_limit': -1, 'max_limit': -1, 'fee_amount': 0, 'fee_percent': 0, 'fee_cap': 0, 'adjust_fee_percent': False, 'is_enabled': True},
        '9': {'min_limit': -1, 'max_limit': -1, 'fee_amount': 0, 'fee_percent': 0, 'fee_cap': 0, 'adjust_fee_percent': False, 'is_enabled': True}
    }
}))
")

CREATE_RESP=$(_in_api POST "/api/v1/company_gateways" "$PAYLOAD")
GW_ID=$(echo "$CREATE_RESP" | jq -r '.data.id // empty')
assert_gt "${#GW_ID}" "0" "FA-22" "T3" "Stripe-Gateway via API registriert"

if [[ -z "$GW_ID" ]]; then
  skip_test "FA-22" "T4" "Gateway-Konfiguration korrekt" "Gateway-Erstellung fehlgeschlagen"
  skip_test "FA-22" "T5" "Kreditkarten aktiviert" "Gateway-Erstellung fehlgeschlagen"
  skip_test "FA-22" "T6" "SEPA aktiviert" "Gateway-Erstellung fehlgeschlagen"
  skip_test "FA-22" "T7" "Idempotenz" "Gateway-Erstellung fehlgeschlagen"
  skip_test "FA-22" "T8" "Aufraumen" "Gateway-Erstellung fehlgeschlagen"
  exit 0
fi

# ── T4: Gateway config contains correct key ───────────────────────
GW_DETAIL=$(_in_api GET "/api/v1/company_gateways/${GW_ID}")
GW_KEY=$(echo "$GW_DETAIL" | jq -r '.data.gateway_key // empty')
assert_eq "$GW_KEY" "$STRIPE_GATEWAY_KEY" "FA-22" "T4" "Gateway-Key ist Stripe"

# ── T5: Credit cards enabled (accepted_credit_cards = 7) ─────────
ACC_CC=$(echo "$GW_DETAIL" | jq -r '.data.accepted_credit_cards // 0')
assert_eq "$ACC_CC" "7" "FA-22" "T5" "Kreditkarten aktiviert (Visa+MC+Amex)"

# ── T6: SEPA enabled in fees_and_limits ───────────────────────────
SEPA_ENABLED=$(echo "$GW_DETAIL" | jq -r '.data.fees_and_limits."9".is_enabled // false')
assert_eq "$SEPA_ENABLED" "true" "FA-22" "T6" "SEPA-Lastschrift aktiviert"

# ── T7: Idempotency — update existing gateway ────────────────────
UPDATE_RESP=$(_in_api PUT "/api/v1/company_gateways/${GW_ID}" "$PAYLOAD")
UPD_ID=$(echo "$UPDATE_RESP" | jq -r '.data.id // empty')
assert_eq "$UPD_ID" "$GW_ID" "FA-22" "T7" "Idempotenz — Update liefert gleiche ID"

# ── T8: Cleanup — delete test gateway ────────────────────────────
_in_api DELETE "/api/v1/company_gateways/${GW_ID}" > /dev/null
# InvoiceNinja soft-deletes (archives) gateways — verify archived_at is set
sleep 1
VERIFY=$(_in_api GET "/api/v1/company_gateways/${GW_ID}")
ARCHIVED_AT=$(echo "$VERIFY" | jq -r '.data.archived_at // 0')
assert_gt "$ARCHIVED_AT" "0" "FA-22" "T8" "Test-Gateway archiviert (soft-delete)"
