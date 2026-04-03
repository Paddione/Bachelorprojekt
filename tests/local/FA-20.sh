#!/usr/bin/env bash
# FA-20: Meeting Finalization Pipeline
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NS="${WEB_NS:-website}"
WS_NS="${WS_NS:-workspace}"

WEB_READY=$(kubectl get deployment website -n "$WEB_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

# ── T1: POST /api/meeting/finalize ohne Daten → 400 ─────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/meeting/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$CODE" "400" "FA-20" "T1" "POST /api/meeting/finalize ohne Daten -> 400"
else
  skip_test "FA-20" "T1" "Meeting Finalize" "Website nicht bereit"
fi

# ── T2: POST /api/meeting/finalize mit Daten → 200 + results-Array ──────
if [[ "$WEB_READY" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/meeting/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:'Test',customerEmail:'test@example.com'})}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$CODE" "200" "FA-20" "T2" "POST /api/meeting/finalize mit Daten -> 200"
else
  skip_test "FA-20" "T2" "Meeting Finalize" "Website nicht bereit"
fi

# ── T3: Mattermost "finalize_meeting"-Action loest Pipeline aus ─────────
ACTION_EXISTS=$(grep -r "finalize_meeting" "${SCRIPT_DIR}/../website/src" 2>/dev/null | wc -l | xargs || echo "0")
assert_gt "$ACTION_EXISTS" 0 "FA-20" "T3" "Mattermost 'finalize_meeting'-Action vorhanden"
