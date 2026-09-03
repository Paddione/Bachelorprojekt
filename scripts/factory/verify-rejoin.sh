#!/usr/bin/env bash
# scripts/factory/verify-rejoin.sh — rein lesende Verifikation nach einem
# Node-Rejoin (Runbook: docs/runbooks/rejoin-k3s-node.md).
#
# Usage: verify-rejoin.sh <node-name>   [T016442]
# Exit 0: Node anwesend+Ready, Longhorn READY+SCHEDULABLE, keine degraded Volumes.
set -euo pipefail

NODE="${1:?Usage: verify-rejoin.sh <node-name>}"
CTX="${KUBECTL_CONTEXT:-fleet}"
fail=0

echo "== 1/3 Node '${NODE}' anwesend und Ready?"
ready=$(kubectl --context "$CTX" get node "$NODE" \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
if [ "$ready" != "True" ]; then
  echo "FAIL: node ${NODE} nicht anwesend oder Ready (status=${ready:-none})"
  fail=1
else
  echo "OK: node ${NODE} Ready"
fi

echo "== 2/3 Longhorn-Node READY + SCHEDULABLE?"
longhorn_state=$(kubectl --context "$CTX" -n longhorn-system get nodes.longhorn.io \
  -o jsonpath='{range .items[*]}{.metadata.name}={.status.conditions[?(@.type=="Ready")].status}/{.spec.allowScheduling}{"\n"}{end}' 2>/dev/null \
  | grep "^${NODE}=" || true)
if [ -z "$longhorn_state" ]; then
  echo "FAIL: Longhorn-Node ${NODE} nicht im Cluster"
  fail=1
elif ! grep -q 'True/true' <<<"$longhorn_state"; then
  echo "FAIL: Longhorn-Node ${NODE} nicht READY/SCHEDULABLE (${longhorn_state})"
  fail=1
else
  echo "OK: Longhorn-Node ${NODE} READY=True SCHEDULABLE=True"
fi

echo "== 3/3 Kein Longhorn-Volume mehr degraded?"
degraded=$(kubectl --context "$CTX" -n longhorn-system get volumes.longhorn.io \
  -o jsonpath='{range .items[*]}{.metadata.name}={.status.robustness}{"\n"}{end}' 2>/dev/null \
  | grep -vc 'healthy' || true)
if [ "$degraded" -gt 0 ]; then
  echo "WARN/FAIL: ${degraded} Volume(s) nicht healthy:"
  kubectl --context "$CTX" -n longhorn-system get volumes.longhorn.io \
    -o jsonpath='{range .items[*]}{.metadata.name}={.status.robustness}{"\n"}{end}' \
    | grep -v 'healthy'
  fail=1
else
  echo "OK: alle Longhorn-Volumes healthy"
fi

exit "$fail"
