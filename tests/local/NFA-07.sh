#!/usr/bin/env bash
# NFA-07: Lizenz — all components open source
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: Mattermost is Team Edition
MM_LICENSE=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN:-}" "http://localhost:8065/api/v4/license/client?format=old" 2>/dev/null | jq -r '.IsLicensed // "false"')
assert_eq "$MM_LICENSE" "false" "NFA-07" "T1" "Mattermost Team Edition (keine Enterprise-Lizenz)"

# T2: All images from open-source projects
IMAGES=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" config --images 2>/dev/null)
assert_contains "$IMAGES" "mattermost-team-edition" "NFA-07" "T2" "Mattermost Team Edition Image"
assert_contains "$IMAGES" "nextcloud" "NFA-07" "T2b" "Nextcloud Image vorhanden"
assert_contains "$IMAGES" "jitsi" "NFA-07" "T2c" "Jitsi Images vorhanden"
assert_contains "$IMAGES" "keycloak" "NFA-07" "T2d" "Keycloak Image vorhanden"
assert_contains "$IMAGES" "lldap" "NFA-07" "T2e" "LLDAP Image vorhanden"
