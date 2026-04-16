#!/usr/bin/env bash
# FA-07: Suche — search messages, files, channels
# NOTE: Mattermost wurde aus dem Stack entfernt. Tests werden übersprungen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3; do
  skip_test "FA-07" "$t" "Mattermost entfernt" "Mattermost wurde aus dem Stack entfernt"
done
