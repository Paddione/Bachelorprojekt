#!/usr/bin/env bash
# scripts/factory/verify-decommission.sh — rein lesende Verifikation nach
# einer Node-Dekommissionierung (Runbook: docs/runbooks/decommission-k3s-node.md).
#
# Usage: verify-decommission.sh <node-name>   [T016425]
# Exit 0: Node abwesend, keine Longhorn-Replicas mehr darauf, Volumes healthy.
set -euo pipefail

NODE="${1:?Usage: verify-decommission.sh <node-name>}"
CTX="${KUBECTL_CONTEXT:-fleet}"
fail=0

echo "== 1/3 Node '${NODE}' abwesend?"
if kubectl --context "$CTX" get node "$NODE" >/dev/null 2>&1; then
  echo "FAIL: node ${NODE} existiert noch im Cluster"
  fail=1
else
  echo "OK: node nicht mehr im Cluster"
fi

echo "== 2/3 Keine Longhorn-Replicas auf '${NODE}'?"
remaining=$(kubectl --context "$CTX" -n longhorn-system get replicas.longhorn.io \
  -o jsonpath='{range .items[*]}{.spec.nodeID}{"\n"}{end}' 2>/dev/null \
  | grep -cx "$NODE" || true)
if [ "$remaining" -gt 0 ]; then
  echo "FAIL: ${remaining} Longhorn-Replica(s) hängen noch an ${NODE}"
  fail=1
else
  echo "OK: keine Replicas auf ${NODE}"
fi

echo "== 3/3 Longhorn-Volumes healthy + attached?"
degraded=$(kubectl --context "$CTX" -n longhorn-system get volumes.longhorn.io \
  -o jsonpath='{range .items[*]}{.metadata.name}={.status.robustness}{"/"}{.status.state}{"\n"}{end}' 2>/dev/null \
  | grep -cv 'healthy/attached' || true)
if [ "$degraded" -gt 0 ]; then
  echo "WARN/FAIL: ${degraded} Volume(s) nicht healthy/attached:"
  kubectl --context "$CTX" -n longhorn-system get volumes.longhorn.io \
    -o jsonpath='{range .items[*]}{.metadata.name}={.status.robustness}{"/"}{.status.state}{"\n"}{end}' \
    | grep -v 'healthy/attached'
  fail=1
else
  echo "OK: alle Longhorn-Volumes healthy/attached"
fi

exit "$fail"
