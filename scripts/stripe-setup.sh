#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# stripe-setup.sh
#
# Registers Stripe as a payment gateway in Invoice Ninja via API.
# Enables credit card (Visa, Mastercard, Amex) and SEPA payments.
# Runs API calls from inside the cluster (via kubectl exec) to
# bypass the OAuth2 proxy on billing.localhost.
#
# Prerequisites:
#   - Invoice Ninja deployed and accessible
#   - Stripe API keys in workspace-secrets
#
# Usage:
#   bash scripts/stripe-setup.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
IN_URL="http://invoiceninja:80/api/v1"
STRIPE_GATEWAY_KEY="d14dd26a37cecc30fdd65700bfb55b23"

STRIPE_PK="${STRIPE_PK:-$(kubectl get secret workspace-secrets -n "$NAMESPACE" -o jsonpath='{.data.STRIPE_PUBLISHABLE_KEY}' | base64 -d)}"
STRIPE_SK="${STRIPE_SK:-$(kubectl get secret workspace-secrets -n "$NAMESPACE" -o jsonpath='{.data.STRIPE_SECRET_KEY}' | base64 -d)}"

# Helper: run curl inside the cluster via mattermost pod
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- curl -s "$@" 2>/dev/null; }

# Get a valid API token by logging in
if [[ -n "${IN_TOKEN:-}" ]]; then
  echo "  Using provided IN_TOKEN"
else
  IN_ADMIN_EMAIL="admin@workspace.local"
  IN_ADMIN_PW=$(kubectl get secret workspace-secrets -n "$NAMESPACE" -o jsonpath='{.data.INVOICENINJA_ADMIN_PASSWORD}' | base64 -d)
  echo "  Logging into Invoice Ninja as ${IN_ADMIN_EMAIL}..."
  IN_TOKEN=$(_kube_curl -X POST "${IN_URL%/api/v1}/api/v1/login" \
    -H "Content-Type: application/json" \
    -H "X-Requested-With: XMLHttpRequest" \
    -d "{\"email\":\"${IN_ADMIN_EMAIL}\",\"password\":\"${IN_ADMIN_PW}\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['token']['token'])")
  if [[ -z "$IN_TOKEN" ]]; then
    echo "✗ Failed to login to Invoice Ninja"
    exit 1
  fi
  echo "  ✓ Logged in"
fi

# Helper: Invoice Ninja API call (in-cluster)
in_api() {
  local method="$1" endpoint="$2"
  shift 2
  _kube_curl -X "${method}" "${IN_URL}${endpoint}" \
    -H "X-Api-Token: ${IN_TOKEN}" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "Content-Type: application/json" \
    "$@"
}

echo "=== Stripe Payment Gateway Setup ==="

# Check if Stripe gateway already exists (skip archived ones)
EXISTING=$(in_api GET "/company_gateways" | python3 -c "
import sys, json
data = json.load(sys.stdin).get('data', [])
for gw in data:
    if gw.get('gateway_key') == '${STRIPE_GATEWAY_KEY}' and not gw.get('archived_at', 0):
        print(gw['id'])
        break
" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "  Stripe gateway already configured (ID: ${EXISTING}), updating..."
  METHOD="PUT"
  ENDPOINT="/company_gateways/${EXISTING}"
else
  echo "  Creating Stripe gateway..."
  METHOD="POST"
  ENDPOINT="/company_gateways"
fi

# Build payload with JSON-encoded config string
PAYLOAD=$(python3 -c "
import json
config = json.dumps({
    'publishableKey': '${STRIPE_PK}',
    'apiKey': '${STRIPE_SK}',
    'appleDomainVerification': ''
})
# accepted_credit_cards bitmask: Visa(1) + Mastercard(2) + Amex(4) = 7
print(json.dumps({
    'gateway_key': '${STRIPE_GATEWAY_KEY}',
    'config': config,
    'accepted_credit_cards': 7,
    'token_billing': 'always',
    'require_cvv': True,
    'require_billing_address': False,
    'require_shipping_address': False,
    'label': 'Stripe',
    'fees_and_limits': {
        '1': {
            'min_limit': -1, 'max_limit': -1,
            'fee_amount': 0, 'fee_percent': 0, 'fee_cap': 0,
            'adjust_fee_percent': False, 'is_enabled': True
        },
        '9': {
            'min_limit': -1, 'max_limit': -1,
            'fee_amount': 0, 'fee_percent': 0, 'fee_cap': 0,
            'adjust_fee_percent': False, 'is_enabled': True
        }
    }
}))
")

RESULT=$(in_api "${METHOD}" "${ENDPOINT}" -d "${PAYLOAD}")
GW_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || true)

if [ -n "$GW_ID" ]; then
  echo "✓ Stripe gateway configured (ID: ${GW_ID})"
  echo "  - Credit cards: Visa, Mastercard, Amex"
  echo "  - SEPA direct debit: enabled"
  echo "  - Mode: $(echo "${STRIPE_PK}" | grep -q 'pk_test' && echo 'TEST' || echo 'LIVE')"
else
  echo "✗ Failed to configure Stripe gateway"
  echo "  Response: ${RESULT}"
  exit 1
fi

echo ""
echo "=== Setup complete ==="
echo "Invoices created on booking approval will now include a 'Pay Now' button."
