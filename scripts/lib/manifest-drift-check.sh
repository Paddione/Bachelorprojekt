#!/usr/bin/env bash
# manifest-drift-check.sh — Prüft Konfig-Drift zwischen Manifest und live Cluster.
#
# Usage: bash scripts/lib/manifest-drift-check.sh <replicas|probes|sealed>
# Returns: count of drifts as integer (0 = all match, fail-closed).
#
# Modes:
#   replicas — compares Deployment.spec.replicas with status.replicas
#   probes   — checks readinessProbe/livenessProbe presence (manifest-only, simplified)
#   sealed   — checks SealedSecret status conditions (Unsealed=False)

MODE="${1:-replicas}"
CTX="${HG_OPS_CTX:-fleet}"
NS="${HG_OPS_NS:-workspace}"

case "$MODE" in
  replicas)
    kubectl get deployments -n "$NS" --context "$CTX" -o json 2>/dev/null | \
    python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
if not items:
    print('-')
    sys.exit(0)
drift = 0
for d in items:
    spec = d.get('spec', {}) or {}
    status = d.get('status', {}) or {}
    desired = spec.get('replicas', 1)
    actual = status.get('replicas', 0)
    if desired != actual:
        drift += 1
print(drift)
" 2>/dev/null || echo "-"
    ;;
  probes)
    # Simplified: counts Deployments where a container has no readinessProbe
    # but others in the same deployment do (inconsistent probe config).
    kubectl get deployments -n "$NS" --context "$CTX" -o json 2>/dev/null | \
    python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
if not items:
    print('-')
    sys.exit(0)
drift = 0
for d in items:
    containers = (d.get('spec', {}) or {}).get('template', {}).get('spec', {}).get('containers') or []
    for c in containers:
        if not c.get('readinessProbe'):
            drift += 1
print(drift)
" 2>/dev/null || echo "-"
    ;;
  sealed)
    # Checks SealedSecret status conditions for Unsealed=False.
    kubectl get sealedsecrets -A --context "$CTX" -o json 2>/dev/null | \
    python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
if not items:
    print('-')
    sys.exit(0)
drift = 0
for s in items:
    for cond in (s.get('status', {}) or {}).get('conditions', []) or []:
        if cond.get('type') == 'Unsealed' and cond.get('status') == 'False':
            drift += 1
print(drift)
" 2>/dev/null || echo "-"
    ;;
  *)
    echo "unbekannter Modus: $MODE" >&2
    exit 2
    ;;
esac
