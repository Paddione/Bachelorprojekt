#!/usr/bin/env bash
# FA-04: Dateiablage — upload files via API, check persistence
# NOTE: Mattermost wurde aus dem Stack entfernt. Dateiablage erfolgt über Nextcloud (FA-03).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3 T4 T5; do
  skip_test "FA-04" "$t" "Mattermost entfernt" "Mattermost wurde aus dem Stack entfernt"
done
