#!/usr/bin/env bash
# FA-02: Kanäle / Workspaces — public/private channels, teams
# NOTE: Mattermost wurde aus dem Stack entfernt. Tests werden übersprungen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3 T4 T5 T6; do
  skip_test "FA-02" "$t" "Mattermost entfernt" "Mattermost wurde aus dem Stack entfernt"
done
