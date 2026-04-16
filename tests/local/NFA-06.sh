#!/usr/bin/env bash
# NFA-06: Neustart-Resilienz — Website-Service erholt sich nach Neustart
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${WEB_NAMESPACE:-website}"

# T1: Website-Deployment neustarten
RESTART_STATUS=$(kubectl rollout restart deployment/website -n "$NAMESPACE" 2>&1)
assert_contains "$RESTART_STATUS" "restarted" "NFA-06" "T1" "Website-Deployment Neustart ausgelöst"

kubectl rollout status deployment/website -n "$NAMESPACE" --timeout=60s > /dev/null 2>&1
READY=$(kubectl get deployment website -n "$NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${READY:-0}" 0 "NFA-06" "T2" "Website-Deployment nach Neustart wieder bereit"

LOG_OUTPUT=$(kubectl logs -n "$NAMESPACE" deploy/website --tail=10 2>&1)
assert_gt "${#LOG_OUTPUT}" 0 "NFA-06" "T3" "Website-Logs nach Neustart verfügbar"

assert_summary
