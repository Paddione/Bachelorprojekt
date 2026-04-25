#!/usr/bin/env bash
# FA-27: Systemisches Brett — Pod, REST API, WebSocket sync, snapshot CRUD
# Tests:
#   T1 — brett pod ready
#   T2 — /healthz returns 200
#   T3 — /three.min.js served
#   T4 — /api/state returns empty figures for unknown room
#   T5 — POST /api/snapshots creates a snapshot
#   T6 — GET /api/snapshots/:id returns the same name
#   T7 — GET /api/snapshots?room=<token> contains the snapshot id
#   T8 — WebSocket /sync upgrade succeeds and replies with snapshot
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/assert.sh
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
ROOM="brett-test-$(date +%s)"

# Use kubectl exec to a pod with curl to reach the brett service in-cluster.
# nextcloud has curl and lives in the same namespace; keycloak does not ship curl.
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/nextcloud -- curl -s "$@" 2>/dev/null; }

# ── T1: brett pod running ───────────────────────────────────────
BRETT_READY=$(kubectl get deploy brett -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${BRETT_READY:-0}" "0" "FA-27" "T1" "Brett-Pod running (readyReplicas > 0)"

# ── T2: /healthz returns 200 ────────────────────────────────────
HZ_CODE=$(_kube_curl -o /dev/null -w '%{http_code}' "http://brett:3000/healthz")
assert_eq "$HZ_CODE" "200" "FA-27" "T2" "Brett /healthz erreichbar (HTTP 200)"

# ── T3: vendored /three.min.js served ────────────────────────────
THREE_CODE=$(_kube_curl -o /dev/null -w '%{http_code}' "http://brett:3000/three.min.js")
assert_eq "$THREE_CODE" "200" "FA-27" "T3" "Brett /three.min.js erreichbar (HTTP 200)"

# ── T4: /api/state returns empty figures for unknown room ────────
STATE_BODY=$(_kube_curl "http://brett:3000/api/state?room=${ROOM}")
assert_contains "$STATE_BODY" '"figures"' "FA-27" "T4" "Brett /api/state liefert figures-Schlüssel"

# ── T5: POST /api/snapshots returns id ───────────────────────────
SNAP_RESP=$(_kube_curl -X POST -H 'content-type: application/json' \
  -d "{\"room_token\":\"${ROOM}\",\"name\":\"FA-27 smoke\",\"state\":{\"figures\":[]}}" \
  "http://brett:3000/api/snapshots")
assert_contains "$SNAP_RESP" '"id"' "FA-27" "T5" "Snapshot-POST liefert id"

# Extract the UUID for follow-up queries.
SNAP_ID=$(printf '%s' "$SNAP_RESP" | grep -oE '"id":"[^"]+"' | head -1 | sed 's/"id":"//; s/"$//')

# ── T6: GET /api/snapshots/:id returns the same name ─────────────
GET_RESP=$(_kube_curl "http://brett:3000/api/snapshots/${SNAP_ID}")
assert_contains "$GET_RESP" '"name":"FA-27 smoke"' "FA-27" "T6" "Snapshot-GET liefert gespeicherten Namen"

# ── T7: list filtered by room contains the snapshot ──────────────
LIST_RESP=$(_kube_curl "http://brett:3000/api/snapshots?room=${ROOM}")
assert_contains "$LIST_RESP" "$SNAP_ID" "FA-27" "T7" "Snapshot-Liste für Raum enthält neue id"

# ── T8: WebSocket /sync upgrades and returns a snapshot frame ────
# Use python3 with websocket-client; if not available, skip with a soft pass.
WS_OUT=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -- sh -c '
  command -v python3 >/dev/null || { echo SKIP_NO_PYTHON; exit 0; }
  python3 -c "import websocket" 2>/dev/null || { echo SKIP_NO_WSCLIENT; exit 0; }
  python3 - <<PY
import json, websocket
ws = websocket.create_connection("ws://brett:3000/sync", timeout=5)
ws.send(json.dumps({"type":"join","room":"'"${ROOM}"'"}))
print(ws.recv())
ws.close()
PY
' 2>/dev/null)

if [[ "$WS_OUT" == SKIP_* ]]; then
  skip_test "FA-27" "T8" "WebSocket /sync liefert snapshot nach join" "$WS_OUT (websocket-client nicht im Test-Image)"
else
  assert_contains "$WS_OUT" '"type":"snapshot"' "FA-27" "T8" "WebSocket /sync liefert snapshot nach join"
fi
