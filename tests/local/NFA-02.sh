#!/usr/bin/env bash
# NFA-02: Performance — response times, resource efficiency (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# Thresholds (milliseconds) — more lenient for k3d than prod
THRESHOLD_API=3000     # 3s for API endpoints (k3d is slower)
THRESHOLD_PAGE=5000    # 5s for full page loads

# T1: Keycloak health response time
KC_START=$(date +%s%3N)
KC_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${KC_URL}/health/ready" 2>/dev/null || echo "000")
KC_DUR=$(( $(date +%s%3N) - KC_START ))
assert_eq "$KC_STATUS" "200" "NFA-02" "T1a" "Keycloak Health-Endpoint erreichbar"
assert_lt "$KC_DUR" "$THRESHOLD_API" "NFA-02" "T1b" "Keycloak Antwortzeit < ${THRESHOLD_API}ms (war ${KC_DUR}ms)"

# T2: Vaultwarden API response time
VW_START=$(date +%s%3N)
VW_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://vault.localhost/alive" 2>/dev/null || echo "000")
VW_DUR=$(( $(date +%s%3N) - VW_START ))
assert_match "$VW_STATUS" "^(200|302)$" "NFA-02" "T2a" "Vaultwarden erreichbar"
assert_lt "$VW_DUR" "$THRESHOLD_API" "NFA-02" "T2b" "Vaultwarden Antwortzeit < ${THRESHOLD_API}ms (war ${VW_DUR}ms)"

# T3: Nextcloud response time
NC_START=$(date +%s%3N)
NC_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${NC_URL}/status.php" 2>/dev/null || echo "000")
NC_DUR=$(( $(date +%s%3N) - NC_START ))
assert_match "$NC_STATUS" "^(200|302)$" "NFA-02" "T3a" "Nextcloud erreichbar"
assert_lt "$NC_DUR" "$THRESHOLD_PAGE" "NFA-02" "T3b" "Nextcloud Antwortzeit < ${THRESHOLD_PAGE}ms (war ${NC_DUR}ms)"

# T4: Website API response time
WEB_START=$(date +%s%3N)
WEB_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://web.localhost/" 2>/dev/null || echo "000")
WEB_DUR=$(( $(date +%s%3N) - WEB_START ))
if [[ "$WEB_STATUS" != "000" ]]; then
  assert_lt "$WEB_DUR" "$THRESHOLD_PAGE" "NFA-02" "T4" "Website Antwortzeit < ${THRESHOLD_PAGE}ms (war ${WEB_DUR}ms)"
else
  skip_test "NFA-02" "T4" "Website Antwortzeit" "Website nicht erreichbar"
fi

# T5: Pod resource limits set on all containers
PODS_WITHOUT_LIMITS=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null \
  | jq '[.items[].spec.containers[] | select(.resources.requests == null or .resources.requests.memory == null)] | length')
assert_eq "${PODS_WITHOUT_LIMITS:-99}" "0" "NFA-02" "T5" "Alle Container haben Resource Requests"

# T6: No pods in CrashLoopBackOff or OOMKilled
CRASH_PODS=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null \
  | grep -cE "CrashLoopBackOff|OOMKilled|Error" || true)
assert_eq "${CRASH_PODS:-0}" "0" "NFA-02" "T6" "Keine Pods in CrashLoop/OOMKilled"
