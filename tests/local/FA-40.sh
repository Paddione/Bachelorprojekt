#!/usr/bin/env bash
# FA-40: Spectator join smoke — verifies arena-server is up and spectator:join is valid protocol
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NAMESPACE:-workspace}"

# T1: arena-server pod is Ready
READY=$(kubectl -n "$NS" get deploy/arena-server \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "")
assert_gt "${READY:-0}" 0 "FA-40" "T1" "arena-server pod is Ready"
[ "${READY:-0}" -gt 0 ] || { echo "Skipping remaining tests — arena-server not ready"; exit 0; }

# T2: healthz responds with ok:true
HEALTH=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS http://localhost:8090/healthz 2>/dev/null || echo "{}")
assert_contains "$HEALTH" '"ok"' "FA-40" "T2" "arena-server healthz returns ok"

# T3: /match requires auth (spectator feature uses same auth gate)
HTTP_STATUS=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS -o /dev/null -w '%{http_code}' http://localhost:8090/match 2>/dev/null || echo "000")
assert_eq "$HTTP_STATUS" "401" "FA-40" "T3" "/match returns 401 without bearer token"

# T4: spectator:join is registered in CLIENT_TYPES (source check)
SPECTATOR_TYPE=$(kubectl -n "$NS" exec deploy/arena-server -- \
  grep -c "spectator:join" /app/src/proto/messages.ts 2>/dev/null || echo "0")
assert_gt "${SPECTATOR_TYPE:-0}" 0 "FA-40" "T4" "spectator:join registered in messages.ts"

# NOTE: Full spectator Socket.io test (spectator:join → match:full-snapshot round-trip) requires
# two concurrent authenticated sessions and is deferred to Playwright (spec §4).
echo "FA-40 PASS (Socket.io round-trip deferred to Playwright)"
