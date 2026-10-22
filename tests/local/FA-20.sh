#!/usr/bin/env bash
# FA-20: Meeting Finalization Pipeline
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"
WS_NS="${WS_NS:-workspace}"

WEB_READY=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

# ── T1: POST /api/meeting/finalize ohne Daten → 400 ─────────────────────
# F4: Routen brauchen den internen Bearer-Token — das Skript laeuft im
# Website-Pod und liest ihn aus dessen Umgebung (pre-/post-Gate identisch).
if [[ "$WEB_READY" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    node -e "const t=process.env.MEETING_INTERNAL_TOKEN||'';fetch('http://localhost:4321/api/meeting/finalize',{method:'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:'{}'}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$CODE" "400" "FA-20" "T1" "POST /api/meeting/finalize ohne Daten -> 400"
else
  skip_test "FA-20" "T1" "Meeting Finalize" "Website nicht bereit"
fi

# ── T2: POST /api/meeting/finalize mit Daten → 200 + results-Array ──────
if [[ "$WEB_READY" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    node -e "const t=process.env.MEETING_INTERNAL_TOKEN||'';fetch('http://localhost:4321/api/meeting/finalize',{method:'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:JSON.stringify({customerName:'Test',customerEmail:'test@example.com'})}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$CODE" "200" "FA-20" "T2" "POST /api/meeting/finalize mit Daten -> 200"
else
  skip_test "FA-20" "T2" "Meeting Finalize" "Website nicht bereit"
fi

# ── T3: finalize_meeting-Action in Website-Code vorhanden ────────────
ACTION_EXISTS=$(grep -r "finalize_meeting" "${SCRIPT_DIR}/../components/website/src" 2>/dev/null | wc -l | xargs || echo "0")
assert_gt "$ACTION_EXISTS" 0 "FA-20" "T3" "finalize_meeting-Action vorhanden"
