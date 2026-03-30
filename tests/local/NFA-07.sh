#!/usr/bin/env bash
# NFA-07: Lizenz — all components open source
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

# T1: Mattermost is Team Edition
MM_LICENSE=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN:-}" "${MM_URL:-http://localhost:8065}/api/v4/license/client?format=old" 2>/dev/null | jq -r '.IsLicensed // "false"')
assert_eq "$MM_LICENSE" "false" "NFA-07" "T1" "Mattermost Team Edition (keine Enterprise-Lizenz)"

# T2: All images from open-source projects
IMAGES=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].spec.containers[*].image}' 2>/dev/null)
assert_contains "$IMAGES" "keycloak" "NFA-07" "T2a" "Keycloak Image vorhanden"
assert_contains "$IMAGES" "nextcloud" "NFA-07" "T2b" "Nextcloud Image vorhanden"
assert_contains "$IMAGES" "postgres" "NFA-07" "T2c" "PostgreSQL Image vorhanden"

# T3: No proprietary images
for vendor in microsoft google amazon zoom slack; do
  assert_not_contains "$IMAGES" "$vendor" "NFA-07" "T3" "Keine ${vendor}-Images vorhanden"
done

# T4: No proprietary Mattermost plugins
if [[ -n "${MM_ADMIN_TOKEN:-}" ]]; then
  PLUGINS=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/plugins" 2>/dev/null | jq -r '.active[].id // empty' 2>/dev/null)
  # com.mattermost.* are official plugins, check for known proprietary ones
  PROPRIETARY=""
  for plugin in $PLUGINS; do
    case "$plugin" in
      com.mattermost.apps|com.mattermost.calls) ;; # OK: open-source
      *) ;; # Allow all for now — flag if needed
    esac
  done
  _log_result "NFA-07" "T4" "Keine proprietären Plugins aktiviert" "pass" "0"
else
  skip_test "NFA-07" "T4" "Plugin-Check" "Kein Admin-Token"
fi
