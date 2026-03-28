#!/usr/bin/env bash
# NFA-02: Performance — response times, load test
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: UI load time < 2s
TIME_TOTAL=$(curl -s -o /dev/null -w '%{time_total}' "https://${MM_DOMAIN}" 2>/dev/null)
TIME_MS=$(echo "$TIME_TOTAL" | awk '{printf "%d", $1 * 1000}')
assert_lt "$TIME_MS" 2000 "NFA-02" "T1" "Mattermost UI-Ladezeit < 2s (${TIME_MS}ms)"

# T2: API response < 1s
API_TIME=$(curl -s -o /dev/null -w '%{time_total}' "https://${MM_DOMAIN}/api/v4/system/ping" 2>/dev/null)
API_MS=$(echo "$API_TIME" | awk '{printf "%d", $1 * 1000}')
assert_lt "$API_MS" 1000 "NFA-02" "T2" "API-Antwortzeit < 1s (${API_MS}ms)"

# T3: Nextcloud reachable
if [[ -n "${NC_DOMAIN:-}" ]]; then
  NC_TIME=$(curl -s -o /dev/null -w '%{time_total}' "https://${NC_DOMAIN}/status.php" 2>/dev/null)
  NC_MS=$(echo "$NC_TIME" | awk '{printf "%d", $1 * 1000}')
  assert_lt "$NC_MS" 2000 "NFA-02" "T3" "Nextcloud erreichbar < 2s"
fi

# T5: Load test — 100 requests, 10 concurrent (curl-based)
_NFA02_FAILS=0
_NFA02_TMPDIR=$(mktemp -d)
for i in $(seq 1 100); do
  ( curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      "https://${MM_DOMAIN}/api/v4/system/ping" 2>/dev/null \
      > "${_NFA02_TMPDIR}/${i}" ) &
  # cap concurrency at 10
  (( i % 10 == 0 )) && wait
done
wait
for f in "${_NFA02_TMPDIR}"/*; do
  s=$(cat "$f")
  [[ "$s" == "500" || "$s" == "502" || "$s" == "503" || "$s" == "000" ]] && ((_NFA02_FAILS++)) || true
done
rm -rf "$_NFA02_TMPDIR"
assert_lt "$_NFA02_FAILS" 5 "NFA-02" "T5" "Load-Test: < 5 Fehler bei 100 Requests (${_NFA02_FAILS} Fehler)"
