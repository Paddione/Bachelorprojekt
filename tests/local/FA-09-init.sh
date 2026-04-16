#!/usr/bin/env bash
# FA-09-init: billing-bot-init-job — Manifest-Validierung und Cluster-Zustand
# NOTE: billing-bot und InvoiceNinja wurden aus dem Stack entfernt. Tests werden übersprungen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in Init-A1 Init-A-ServiceAccount Init-A-Role Init-A-RoleBinding Init-A-Job Init-C1 Init-C2 Init-D1 Init-D2 Init-D3; do
  skip_test "FA-09" "$t" "billing-bot entfernt" "billing-bot-init-job wurde aus dem Stack entfernt"
done
