#!/usr/bin/env bash
post_deploy_watch() {
  local cluster="$1" deployment="$2" namespace="$3" context="$4" health_url="$5"
  local errors=0 i
  for i in 1 2 3 4 5; do
    echo "▸ post-deploy-watch ${cluster}: probe ${i}/5 (${deployment} in ${namespace})"
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  [dry-run] kubectl --context ${context} -n ${namespace} get pods -l app=${deployment}"
      echo "  [dry-run] curl -fsS ${health_url}"
      return 0
    fi
    local crash_pods
    crash_pods=$(kubectl --context "$context" -n "$namespace" get pods -l "app=${deployment}" \
      -o jsonpath='{range .items[*]}{.status.containerStatuses[0].state.waiting.reason}{"\n"}{end}' 2>/dev/null || true)
    if echo "$crash_pods" | grep -qE 'CrashLoopBackOff|Error|OOMKilled'; then
      echo "✗ CrashLoopBackOff/Error/OOMKilled detected on ${cluster}/${deployment}" >&2
      notify_pushover "Deploy FAIL ${cluster}" "CrashLoopBackOff detected on ${deployment} in ${namespace} — rolling back" "1"
      kubectl --context "$context" -n "$namespace" rollout undo "deploy/${deployment}" || true
      kubectl --context "$context" -n "$namespace" rollout status "deploy/${deployment}" --timeout=120s || true
      return 1
    fi
    if curl -fsS -o /dev/null --max-time 20 "$health_url" 2>/dev/null; then
      errors=0
    else
      errors=$((errors + 1))
      echo "  healthcheck failed (${errors}/3)" >&2
    fi
    if [[ "$errors" -ge 3 ]]; then
      echo "✗ 3 consecutive healthcheck failures on ${cluster}/${deployment}" >&2
      notify_pushover "Deploy FAIL ${cluster}" "3 consecutive healthcheck failures on ${deployment} in ${namespace} — rolling back" "1"
      kubectl --context "$context" -n "$namespace" rollout undo "deploy/${deployment}" || true
      kubectl --context "$context" -n "$namespace" rollout status "deploy/${deployment}" --timeout=120s || true
      return 1
    fi
    [[ "$i" -lt 5 ]] && sleep 60
  done
  echo "✓ post-deploy-watch ${cluster}: ${deployment} healthy"
  return 0
}
