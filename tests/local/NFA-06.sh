#!/usr/bin/env bash
# NFA-06: Wartbarkeit — pod lifecycle, logs, ConfigMap config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

# T1: All pods healthy (Running or Completed)
UNHEALTHY=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null \
  | grep -v 'Running\|Completed' | awk '{print $1}' | head -5)
assert_eq "${UNHEALTHY:-}" "" "NFA-06" "T1" "Alle Pods healthy"

# T2: Pod lifecycle — rolling restart works
RESTART_STATUS=$(kubectl rollout restart deployment/mattermost -n "$NAMESPACE" 2>&1)
assert_contains "$RESTART_STATUS" "restarted" "NFA-06" "T2" "Rolling Restart funktioniert"
kubectl rollout status deployment/mattermost -n "$NAMESPACE" --timeout=60s > /dev/null 2>&1

# T3: Resource requests/limits set on all containers
CONTAINERS_WITHOUT_LIMITS=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null \
  | jq '[.items[].spec.containers[] | select(.resources.requests == null or .resources.requests.memory == null)] | length')
assert_eq "${CONTAINERS_WITHOUT_LIMITS:-999}" "0" "NFA-06" "T3" "Alle Container haben Resource Requests"

# T4: Logs readable
LOG_OUTPUT=$(kubectl logs -n "$NAMESPACE" deploy/mattermost --tail=10 2>&1)
assert_gt "${#LOG_OUTPUT}" 0 "NFA-06" "T4" "kubectl logs liefert Ausgabe"

# T5: ConfigMap or Secret exists for configuration
CONFIG_COUNT=$(kubectl get configmaps,secrets -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
assert_gt "$CONFIG_COUNT" 0 "NFA-06" "T5" "ConfigMaps/Secrets fuer Konfiguration vorhanden"
