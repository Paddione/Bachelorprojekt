#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/flux-stalled-check.sh — Flux Stuck Reconciliation Detection
# ═══════════════════════════════════════════════════════════════════
# Reads Flux Kustomizations from the fleet cluster and reports any
# that have been Ready=False beyond a threshold, or whose
# lastAppliedRevision is empty (never applied).
#
# Read-only — never mutates cluster state. (T002207)
#
# Usage:
#   bash scripts/flux-stalled-check.sh [--threshold 30m] [--context fleet]
#
# Defaults: threshold=30m, context=fleet
set -euo pipefail

THRESHOLD="30m"
CONTEXT="fleet"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --context)   CONTEXT="$2";   shift 2 ;;
    *)
      echo "Usage: $0 [--threshold DURATION] [--context NAME]" >&2
      echo "  --threshold  Max acceptable Ready=False duration (default: 30m)" >&2
      echo "  --context    kubectl context (default: fleet)" >&2
      exit 1
      ;;
  esac
done

# Convert threshold to seconds
case "$THRESHOLD" in
  *h) THRESHOLD_SEC=$(( ${THRESHOLD%h} * 3600 )) ;;
  *m) THRESHOLD_SEC=$(( ${THRESHOLD%m} * 60 ))   ;;
  *s) THRESHOLD_SEC="${THRESHOLD%s}"              ;;
  *)  THRESHOLD_SEC="$THRESHOLD"                  ;;
esac

echo "flux-stalled-check: context=${CONTEXT} threshold=${THRESHOLD} (${THRESHOLD_SEC}s)"

# Fetch Kustomizations
KS_JSON=$(kubectl --context "$CONTEXT" -n flux-system get kustomization -o json 2>/dev/null || true)
if [[ -z "$KS_JSON" ]]; then
  echo "ERROR: Cannot reach context '${CONTEXT}' — is the cluster up?" >&2
  exit 2
fi

NOW_EPOCH=$(date +%s)
STALLED_COUNT=0

# Parse each Kustomization with jq
while IFS=$'\t' read -r name ready_status reason message last_transition last_applied; do
  [[ -z "$name" ]] && continue

  # Check 1: lastAppliedRevision empty (never applied)
  if [[ -z "$last_applied" || "$last_applied" == "null" ]]; then
    echo "⚠️  STALLED: ${name} — lastAppliedRevision is empty (never applied)"
    STALLED_COUNT=$(( STALLED_COUNT + 1 ))
    continue
  fi

  # Check 2: Ready=False beyond threshold
  if [[ "$ready_status" == "False" && -n "$last_transition" && "$last_transition" != "null" ]]; then
    # Parse K8s timestamp to epoch
    TS_CLEAN="${last_transition%Z}"
    if [[ "$TS_CLEAN" == *"."* ]]; then
      TS_CLEAN="${TS_CLEAN%.*}"
    fi
    TS_EPOCH=$(date -d "$TS_CLEAN" +%s 2>/dev/null || echo 0)
    AGE=$(( NOW_EPOCH - TS_EPOCH ))

    if (( AGE > THRESHOLD_SEC && AGE > 0 )); then
      echo "⚠️  STALLED: ${name} — Ready=False for ${AGE}s (threshold ${THRESHOLD_SEC}s)"
      echo "   Reason: ${reason}"
      echo "   Message: ${message:0:200}"
      STALLED_COUNT=$(( STALLED_COUNT + 1 ))
    fi
  fi
done < <(echo "$KS_JSON" | jq -r '
  .items[] | 
  [
    .metadata.name,
    (.status.conditions[] | select(.type == "Ready") | .status // "Unknown"),
    (.status.conditions[] | select(.type == "Ready") | .reason // ""),
    (.status.conditions[] | select(.type == "Ready") | .message // ""),
    (.status.conditions[] | select(.type == "Ready") | .lastTransitionTime // ""),
    (.status.lastAppliedRevision // "")
  ] | @tsv
')

if (( STALLED_COUNT > 0 )); then
  echo "❌ flux-stalled-check: ${STALLED_COUNT} stalled Kustomization(s) found."
  exit 1
else
  echo "✅ flux-stalled-check: all Kustomizations healthy."
  exit 0
fi
