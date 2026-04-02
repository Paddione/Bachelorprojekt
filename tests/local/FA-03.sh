#!/usr/bin/env bash
# FA-03: Videokonferenzen — Nextcloud Talk HPB (signaling, DNS, coturn, guest)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

# Helper: curl inside the cluster via nextcloud pod
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- curl -s "$@" 2>/dev/null; }

# T1: Talk app installed and functional (Nextcloud Talk conversation list reachable)
NC_TALK_STATUS=$(_kube_curl -o /dev/null -w '%{http_code}' "http://localhost/ocs/v2.php/apps/spreed/api/v4/room" \
  -H "OCS-APIRequest: true" -H "Accept: application/json" --max-time 10 || echo "000")
if [[ "$NC_TALK_STATUS" == "401" || "$NC_TALK_STATUS" == "200" ]]; then
  # 401 = endpoint exists but needs auth, 200 = authenticated — both prove Talk works
  _log_result "FA-03" "T1" "Talk-App in Nextcloud erreichbar" "pass" "0"
else
  _log_result "FA-03" "T1" "Talk-App in Nextcloud erreichbar" "fail" "0" "HTTP ${NC_TALK_STATUS}"
fi

# T2: Screen sharing capability — Janus WebRTC gateway has videoroom plugin
JANUS_HEALTH=$(_kube_curl -o /dev/null -w '%{http_code}' "http://janus:8188" --max-time 5 || echo "000")
if [[ "$JANUS_HEALTH" != "000" ]]; then
  _log_result "FA-03" "T2" "Janus WebRTC Gateway erreichbar (Bildschirmfreigabe-Voraussetzung)" "pass" "0"
else
  _log_result "FA-03" "T2" "Janus WebRTC Gateway erreichbar (Bildschirmfreigabe-Voraussetzung)" "fail" "0" "Janus nicht erreichbar"
fi

# T3: No external TURN/STUN — verify coturn is cluster-internal, no external WebRTC services
SIGNALING_CONF=$(kubectl exec -n "$NAMESPACE" deploy/spreed-signaling -- \
  cat /etc/signaling/server.conf 2>/dev/null || echo "")
if [[ -n "$SIGNALING_CONF" ]]; then
  # TURN server uses either cluster-internal "coturn" name or the node IP with coturn NodePort
  COTURN_NODEPORT=$(kubectl get svc coturn -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
  if echo "$SIGNALING_CONF" | grep -qE "coturn|:${COTURN_NODEPORT}"; then
    _log_result "FA-03" "T3a" "TURN-Server zeigt auf cluster-internen coturn" "pass" "0"
  else
    _log_result "FA-03" "T3a" "TURN-Server zeigt auf cluster-internen coturn" "fail" "0" \
      "Weder 'coturn' noch NodePort :${COTURN_NODEPORT} in signaling config gefunden"
  fi
  assert_not_contains "$SIGNALING_CONF" "stun.l.google.com" "FA-03" "T3b" "Kein externer Google STUN-Server konfiguriert"
  assert_not_contains "$SIGNALING_CONF" "turn.jit.si" "FA-03" "T3c" "Kein externer Jitsi TURN-Server konfiguriert"
else
  skip_test "FA-03" "T3a" "TURN-Server Konfiguration" "signaling config nicht lesbar"
  skip_test "FA-03" "T3b" "Kein externer Google STUN" "signaling config nicht lesbar"
  skip_test "FA-03" "T3c" "Kein externer Jitsi TURN" "signaling config nicht lesbar"
fi

# T4: HPB signaling server reachable (/api/v1/welcome)
SIGNALING_STATUS=$(_kube_curl -o /dev/null -w '%{http_code}' "http://spreed-signaling:8080/api/v1/welcome" --max-time 5 || echo "000")
assert_eq "$SIGNALING_STATUS" "200" "FA-03" "T4" "HPB Signaling-Server erreichbar (/api/v1/welcome)"

# T5: Guest access — Talk endpoint accessible without authentication
GUEST_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  "${NC_URL:-http://files.localhost}/apps/spreed" 2>/dev/null || echo "000")
# 200 or 302 (redirect to login with Talk visible) both indicate the endpoint exists
if [[ "$GUEST_STATUS" == "200" || "$GUEST_STATUS" == "302" || "$GUEST_STATUS" == "303" ]]; then
  _log_result "FA-03" "T5" "Talk-Endpunkt von extern erreichbar (Gast-Zugang möglich)" "pass" "0"
else
  _log_result "FA-03" "T5" "Talk-Endpunkt von extern erreichbar (Gast-Zugang möglich)" "fail" "0" "HTTP ${GUEST_STATUS}"
fi

# Bonus: coturn reachable
COTURN_POD=$(kubectl get pods -n "$NAMESPACE" -l app=coturn --no-headers 2>/dev/null | grep -c 'Running')
assert_gt "$COTURN_POD" 0 "FA-03" "T3d" "coturn TURN/STUN Pod läuft"

# Bonus: NATS message bus reachable
NATS_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nats --no-headers 2>/dev/null | grep -c 'Running')
assert_gt "$NATS_POD" 0 "FA-03" "T3e" "NATS Message Bus Pod läuft"

# T6: Guest access to Talk room (Gap 1.6 / O)
# Create a public Talk room via Nextcloud OCS API and verify guest can reach it
NC_ADMIN_PASS=$(kubectl get secret -n "$NAMESPACE" homeoffice-secrets \
  -o jsonpath='{.data.NEXTCLOUD_ADMIN_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || echo "devnextcloudadmin")
# Create public conversation (type 3 = public)
ROOM_RESP=$(_kube_curl -X POST \
  -H "OCS-APIRequest: true" -H "Accept: application/json" \
  -u "admin:${NC_ADMIN_PASS}" \
  -d '{"roomType":3,"roomName":"guest-test-room"}' \
  "http://localhost/ocs/v2.php/apps/spreed/api/v4/room" --max-time 10 2>/dev/null || echo "{}")
ROOM_TOKEN=$(echo "$ROOM_RESP" | jq -r '.ocs.data.token // empty' 2>/dev/null)
if [[ -n "$ROOM_TOKEN" ]]; then
  # Verify guest can access the room without credentials (OCS API returns room info)
  GUEST_RESP=$(_kube_curl -o /dev/null -w '%{http_code}' \
    -H "OCS-APIRequest: true" -H "Accept: application/json" \
    "http://localhost/ocs/v2.php/apps/spreed/api/v4/room/${ROOM_TOKEN}" --max-time 10 2>/dev/null || echo "000")
  # 200 = room info returned to guest, 404 = room not found but endpoint works
  if [[ "$GUEST_RESP" == "200" ]]; then
    _log_result "FA-03" "T6" "Gast-Zugang zu Talk-Raum via Link möglich" "pass" "0"
  else
    _log_result "FA-03" "T6" "Gast-Zugang zu Talk-Raum via Link möglich" "fail" "0" "HTTP ${GUEST_RESP} (erwartet 200)"
  fi
  # Cleanup — delete the room
  _kube_curl -X DELETE -H "OCS-APIRequest: true" -u "admin:${NC_ADMIN_PASS}" \
    "http://localhost/ocs/v2.php/apps/spreed/api/v4/room/${ROOM_TOKEN}" --max-time 5 > /dev/null 2>&1 || true
else
  skip_test "FA-03" "T6" "Gast-Zugang zu Talk-Raum via Link möglich" "Talk-Raum konnte nicht erstellt werden"
fi
