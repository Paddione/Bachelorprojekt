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

# T5: Load test with ab
if command -v ab &>/dev/null; then
  AB_OUT=$(ab -n 100 -c 10 "https://${MM_DOMAIN}/api/v4/system/ping" 2>&1)
  FAIL_PCT=$(echo "$AB_OUT" | grep "Failed requests" | awk '{print $3}')
  assert_lt "${FAIL_PCT:-100}" 5 "NFA-02" "T5" "Apache Bench: < 5% Fehlerrate bei 100 Requests"
else
  skip_test "NFA-02" "T5" "Load test" "Apache Bench (ab) nicht installiert"
fi
