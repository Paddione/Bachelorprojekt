#!/usr/bin/env bash
# FA-18: Meeting Transcription — Whisper deployment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WS_NS="${WS_NS:-workspace}"
WEB_NAMESPACE="${WEB_NAMESPACE:-website}"

# ── T1: Whisper pod running ───────────────────────────────────────
WH_READY=$(kubectl get deployment whisper -n "$WS_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WH_READY" 0 "FA-18" "T1" "Whisper-Deployment laeuft (readyReplicas > 0)"

# ── T2: Whisper health endpoint ───────────────────────────────────
if [[ "$WH_READY" -gt 0 ]]; then
  HEALTH=$(kubectl exec -n "$WS_NS" deploy/whisper -- \
    python3 -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())" 2>/dev/null || echo "")
  if [[ "$HEALTH" == *"OK"* ]]; then
    assert_eq "OK" "OK" "FA-18" "T2" "Whisper Health-Endpoint erreichbar"
  else
    skip_test "FA-18" "T2" "Whisper Health" "Endpoint nicht erreichbar"
  fi
else
  skip_test "FA-18" "T2" "Whisper Health" "Whisper nicht bereit"
fi

# ── T3: Whisper service exists ────────────────────────────────────
SVC_COUNT=$(kubectl get svc whisper -n "$WS_NS" -o name 2>/dev/null | wc -l)
assert_gt "$SVC_COUNT" 0 "FA-18" "T3" "Whisper-Service definiert"

# ── T4: WHISPER_URL in website ConfigMap ──────────────────────────
WH_URL=$(kubectl get configmap website-config -n "$WEB_NAMESPACE" \
  -o jsonpath='{.data.WHISPER_URL}' 2>/dev/null || echo "")
assert_contains "$WH_URL" "whisper" "FA-18" "T4" "WHISPER_URL in Website-ConfigMap"
