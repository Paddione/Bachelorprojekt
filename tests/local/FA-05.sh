#!/usr/bin/env bash
# FA-05: Nutzerverwaltung — create, roles, SSO, deactivate
# NOTE: Mattermost wurde aus dem Stack entfernt. Benutzerverwaltung erfolgt über Keycloak.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3 T4 T5 T6 T7; do
  skip_test "FA-05" "$t" "Mattermost entfernt" "Mattermost wurde aus dem Stack entfernt"
done
