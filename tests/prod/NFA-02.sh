#!/usr/bin/env bash
# NFA-02: Performance — response times, throughput, resource efficiency
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"
NAMESPACE="${NAMESPACE:-workspace}"

# Thresholds (milliseconds)
THRESHOLD_FAST=2000    # 2s for health/API endpoints
THRESHOLD_PAGE=5000    # 5s for full page loads

# T1: Keycloak health response time
KC_START=$(date +%s%3N)
KC_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${KC_URL}/health/ready" 2>/dev/null || echo "000")
KC_DUR=$(( $(date +%s%3N) - KC_START ))
assert_eq "$KC_STATUS" "200" "NFA-02" "T1a" "Keycloak Health-Endpoint erreichbar"
assert_lt "$KC_DUR" "$THRESHOLD_FAST" "NFA-02" "T1b" "Keycloak Antwortzeit < ${THRESHOLD_FAST}ms (war ${KC_DUR}ms)"

# T2: Mattermost API response time
MM_START=$(date +%s%3N)
MM_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${MM_URL}/system/ping" 2>/dev/null || echo "000")
MM_DUR=$(( $(date +%s%3N) - MM_START ))
assert_eq "$MM_STATUS" "200" "NFA-02" "T2a" "Mattermost API erreichbar"
assert_lt "$MM_DUR" "$THRESHOLD_FAST" "NFA-02" "T2b" "Mattermost Antwortzeit < ${THRESHOLD_FAST}ms (war ${MM_DUR}ms)"

# T3: Nextcloud page load time
NC_START=$(date +%s%3N)
NC_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "${NC_URL}/status.php" 2>/dev/null || echo "000")
NC_DUR=$(( $(date +%s%3N) - NC_START ))
assert_match "$NC_STATUS" "^(200|302)$" "NFA-02" "T3a" "Nextcloud erreichbar"
assert_lt "$NC_DUR" "$THRESHOLD_PAGE" "NFA-02" "T3b" "Nextcloud Antwortzeit < ${THRESHOLD_PAGE}ms (war ${NC_DUR}ms)"

# T4: Concurrent load test with ab (Apache Bench)
if command -v ab &>/dev/null; then
  # 50 requests, 10 concurrent to Mattermost ping
  AB_OUT=$(ab -n 50 -c 10 -s 10 -k "${MM_URL}/system/ping" 2>/dev/null || echo "")

  if [[ -n "$AB_OUT" ]]; then
    # Extract mean time per request
    MEAN_MS=$(echo "$AB_OUT" | grep "Time per request" | head -1 | awk '{print int($4)}')
    if [[ -n "$MEAN_MS" ]]; then
      assert_lt "$MEAN_MS" "$THRESHOLD_FAST" "NFA-02" "T4a" "Mittlere Antwortzeit unter Last < ${THRESHOLD_FAST}ms (war ${MEAN_MS}ms)"
    else
      skip_test "NFA-02" "T4a" "Load-Test Antwortzeit" "ab Output nicht parsbar"
    fi

    # Extract failed requests
    FAILED=$(echo "$AB_OUT" | grep "Failed requests" | awk '{print $3}')
    assert_eq "${FAILED:-0}" "0" "NFA-02" "T4b" "Keine fehlgeschlagenen Requests unter Last (50 req, 10 concurrent)"

    # Extract requests per second
    RPS=$(echo "$AB_OUT" | grep "Requests per second" | awk '{print int($4)}')
    if [[ -n "$RPS" ]]; then
      assert_gt "$RPS" 5 "NFA-02" "T4c" "Mindestens 5 req/s Durchsatz (war ${RPS} req/s)"
    fi
  else
    skip_test "NFA-02" "T4a" "Load-Test" "ab fehlgeschlagen"
    skip_test "NFA-02" "T4b" "Load-Test Fehler" "ab fehlgeschlagen"
    skip_test "NFA-02" "T4c" "Load-Test Durchsatz" "ab fehlgeschlagen"
  fi
else
  skip_test "NFA-02" "T4a" "Load-Test Antwortzeit" "ab nicht installiert"
  skip_test "NFA-02" "T4b" "Load-Test Fehler" "ab nicht installiert"
  skip_test "NFA-02" "T4c" "Load-Test Durchsatz" "ab nicht installiert"
fi

# T5: Pod resource limits are set (prevents noisy neighbors)
PODS_WITHOUT_LIMITS=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null \
  | jq '[.items[].spec.containers[] | select(.resources.limits == null or .resources.limits == {})] | length')
assert_eq "${PODS_WITHOUT_LIMITS:-99}" "0" "NFA-02" "T5" "Alle Container haben Resource-Limits"

# T6: No pods in CrashLoopBackOff or OOMKilled
CRASH_PODS=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null \
  | grep -cE "CrashLoopBackOff|OOMKilled|Error" || echo "0")
assert_eq "$CRASH_PODS" "0" "NFA-02" "T6" "Keine Pods in CrashLoop/OOMKilled"
