#!/usr/bin/env bash
# FA-21: Service Catalog & Billing — Leistungen page, InvoiceNinja config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NS="${WEB_NS:-website}"
WS_NS="${WS_NS:-workspace}"

WEB_READY=$(kubectl get deployment website -n "$WEB_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

# ── T1: /leistungen page loads ────────────────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/leistungen').then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$CODE" "200" "FA-21" "T1" "/leistungen-Seite erreichbar"
else
  skip_test "FA-21" "T1" "Leistungen" "Website nicht bereit"
fi

# ── T2: Billing API validates input ───────────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  BILL_CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/billing/create-invoice',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$BILL_CODE" "400" "FA-21" "T2" "Billing-API validiert (400 bei leerem Body)"
else
  skip_test "FA-21" "T2" "Billing API" "Website nicht bereit"
fi

# ── T3: InvoiceNinja running ──────────────────────────────────────
IN_READY=$(kubectl get deployment invoiceninja -n "$WS_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$IN_READY" 0 "FA-21" "T3" "InvoiceNinja laeuft (readyReplicas > 0)"

# ── T4: INVOICENINJA_URL in website ConfigMap ─────────────────────
IN_URL=$(kubectl get configmap website-config -n "$WEB_NS" \
  -o jsonpath='{.data.INVOICENINJA_URL}' 2>/dev/null || echo "")
assert_contains "$IN_URL" "invoiceninja" "FA-21" "T4" "INVOICENINJA_URL in ConfigMap"
