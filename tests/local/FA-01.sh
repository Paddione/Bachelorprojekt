#!/usr/bin/env bash
# FA-01: Messaging (Echtzeit) — send DM, group DM, channel message, persistence
# NOTE: Mattermost wurde aus dem Stack entfernt. Tests werden übersprungen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3 T4 T5 T6 T7 T8 T9; do
  skip_test "FA-01" "$t" "Mattermost entfernt" "Mattermost wurde aus dem Stack entfernt"
done
