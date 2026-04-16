#!/usr/bin/env bash
# SA-06: RBAC — role permissions, guest restrictions
# NOTE: Mattermost wurde aus dem Stack entfernt. Tests werden übersprungen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3 T4; do
  skip_test "SA-06" "$t" "Mattermost entfernt" "Mattermost wurde aus dem Stack entfernt"
done
