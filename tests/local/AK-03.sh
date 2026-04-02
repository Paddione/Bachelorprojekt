#!/usr/bin/env bash
# AK-03: Technische Machbarkeit — k3d pods running, stable image tags
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

# T1: All services running
RUNNING=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -c 'Running')
assert_gt "$RUNNING" 0 "AK-03" "T1" "k3d Cluster: Pods laufen"

# T2: All images use stable release tags (no :latest except curl)
IMAGES=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].spec.containers[*].image}' 2>/dev/null)
UNSTABLE=""
for img in $IMAGES; do
  tag="${img##*:}"
  # Allow :latest for curlimages and :master for janus (only available tag)
  if [[ "$tag" == "latest" && "$img" != *"curlimages"* ]]; then
    UNSTABLE+="${img} "
  fi
done
assert_eq "${UNSTABLE:-}" "" "AK-03" "T2" "Alle Images haben stabile Release-Tags"
