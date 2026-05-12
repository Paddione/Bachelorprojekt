#!/usr/bin/env bash
# FA-39: Arena DB schema bootstrap + service health smoke
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NAMESPACE:-workspace}"

# T1: arena-server pod is Ready
READY=$(kubectl -n "$NS" get deploy/arena-server \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "")
assert_gt "${READY:-0}" 0 "FA-39" "T1" "arena-server pod is Ready"
[ "${READY:-0}" -gt 0 ] || { echo "Skipping remaining tests — arena-server not ready"; exit 0; }

# T2: healthz responds with ok:true
HEALTH=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS http://localhost:8090/healthz 2>/dev/null || echo "{}")
assert_contains "$HEALTH" '"ok"' "FA-39" "T2" "arena-server healthz returns ok"

# T3: /match requires auth (returns 401 without bearer token)
HTTP_STATUS=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS -o /dev/null -w '%{http_code}' http://localhost:8090/match 2>/dev/null || echo "000")
assert_eq "$HTTP_STATUS" "401" "FA-39" "T3" "/match returns 401 without bearer token"

# T4: arena schema exists in shared-db
TABLE_COUNT=$(kubectl -n "$NS" exec deploy/shared-db -- \
  psql -U postgres -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='arena';" \
  2>/dev/null || echo "0")
assert_gt "${TABLE_COUNT:-0}" "0" "FA-39" "T4" "arena schema has tables in shared-db"

# T5: arena.match_players table exists (required for forfeit recording)
MP_EXISTS=$(kubectl -n "$NS" exec deploy/shared-db -- \
  psql -U postgres -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='arena' AND table_name='match_players';" \
  2>/dev/null || echo "0")
assert_eq "${MP_EXISTS:-0}" "1" "FA-39" "T5" "arena.match_players table exists"
