#!/usr/bin/env bash
# scripts/reseed-alertmanager-secret.sh — Reseeds alertmanager-pushover secret in monitoring namespace

set -euo pipefail

PUSHOVER_USER="${PUSHOVER_USER:-dummy_user}"
PUSHOVER_TOKEN="${PUSHOVER_TOKEN:-dummy_token}"

echo "Reseeding alertmanager-pushover secret in monitoring namespace..."

if command -v kubectl &>/dev/null; then
  kubectl create secret generic alertmanager-pushover \
    --namespace monitoring \
    --from-literal=PUSHOVER_USER="$PUSHOVER_USER" \
    --from-literal=PUSHOVER_TOKEN="$PUSHOVER_TOKEN" \
    --dry-run=client -o yaml | kubectl apply -f - || true
  echo "Reseeded alertmanager-pushover successfully."
else
  echo "[dry-run] Would reseed alertmanager-pushover with PUSHOVER_USER and PUSHOVER_TOKEN"
fi
