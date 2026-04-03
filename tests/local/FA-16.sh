#!/usr/bin/env bash
# FA-16: Calendar Booking — Slots API, Booking API, CalDAV config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NS="${WEB_NS:-website}"

WEB_READY=$(kubectl get deployment website -n "$WEB_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

# ── T1: /api/calendar/slots returns 200 ──────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  SLOTS_CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/calendar/slots').then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$SLOTS_CODE" "200" "FA-16" "T1" "Slots-API erreichbar (200)"
else
  skip_test "FA-16" "T1" "Slots API" "Website nicht bereit"
fi

# ── T2: Slots response is valid JSON array ────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  IS_ARRAY=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/calendar/slots').then(r=>r.json()).then(d=>console.log(Array.isArray(d)))" 2>/dev/null || echo "false")
  assert_eq "$IS_ARRAY" "true" "FA-16" "T2" "Slots-Antwort ist JSON-Array"
else
  skip_test "FA-16" "T2" "Slots JSON" "Website nicht bereit"
fi

# ── T3: /termin page loads ────────────────────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  TERMIN_CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/termin').then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$TERMIN_CODE" "200" "FA-16" "T3" "/termin-Seite erreichbar"
else
  skip_test "FA-16" "T3" "Termin Seite" "Website nicht bereit"
fi

# ── T4: POST /api/booking validates input ─────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  BOOKING_CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/booking',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$BOOKING_CODE" "400" "FA-16" "T4" "Booking-API validiert (400 bei leerem Body)"
else
  skip_test "FA-16" "T4" "Booking validation" "Website nicht bereit"
fi

# ── T5: CalDAV config in ConfigMap ────────────────────────────────
NC_URL=$(kubectl get configmap website-config -n "$WEB_NS" \
  -o jsonpath='{.data.NEXTCLOUD_URL}' 2>/dev/null || echo "")
assert_contains "$NC_URL" "nextcloud" "FA-16" "T5" "NEXTCLOUD_URL in ConfigMap konfiguriert"

# ── T6: Working hours configured ──────────────────────────────────
WORK_START=$(kubectl get configmap website-config -n "$WEB_NS" \
  -o jsonpath='{.data.WORK_START_HOUR}' 2>/dev/null || echo "")
assert_eq "$WORK_START" "9" "FA-16" "T6" "WORK_START_HOUR auf 9 konfiguriert"
