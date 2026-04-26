#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Workspace MVP — Cluster und Namespace aufräumen
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

CLUSTER_NAME="${1:-workspace-dev}"

echo "=== Workspace MVP — Teardown ==="
echo ""
read -p "Namespace 'workspace' und Cluster '$CLUSTER_NAME' löschen? [j/N] " -n 1 -r
echo
[[ $REPLY =~ ^[jJyY]$ ]] || exit 0

echo "Lösche Namespace 'workspace'..."
kubectl delete namespace workspace --ignore-not-found --timeout=60s

echo "Lösche k3d Cluster '$CLUSTER_NAME'..."
k3d cluster delete "$CLUSTER_NAME"

echo ""
echo "Fertig."
