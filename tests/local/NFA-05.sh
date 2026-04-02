#!/usr/bin/env bash
# NFA-05: Usability — German locale, keyboard shortcuts, accessibility (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

# T1: Mattermost default locale is German
if [[ -n "${MM_ADMIN_TOKEN:-}" ]]; then
  MM_CONFIG=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/config" 2>/dev/null)
  DEFAULT_LOCALE=$(echo "$MM_CONFIG" | jq -r '.LocalizationSettings.DefaultClientLocale // "en"')
  assert_eq "$DEFAULT_LOCALE" "de" "NFA-05" "T1" "Mattermost Default-Sprache ist Deutsch"
else
  skip_test "NFA-05" "T1" "Sprache Deutsch" "Kein Admin-Token"
fi

# T2: Mattermost login page loads within 5 seconds (onboarding proxy)
LOGIN_START=$(date +%s%3N)
LOGIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://chat.localhost/login" 2>/dev/null || echo "000")
LOGIN_DUR=$(( $(date +%s%3N) - LOGIN_START ))
assert_match "$LOGIN_STATUS" "^(200|302)$" "NFA-05" "T2a" "Login-Seite erreichbar"
assert_lt "$LOGIN_DUR" 5000 "NFA-05" "T2b" "Login-Seite lädt < 5s (war ${LOGIN_DUR}ms)"

# T3: Nextcloud default language is German
NC_LANG=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  gosu 999 php occ config:system:get default_language 2>/dev/null || echo "")
assert_eq "$NC_LANG" "de" "NFA-05" "T3" "Nextcloud Default-Sprache ist Deutsch"

# T4: Mattermost Desktop App download link or web app accessible
WEB_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://chat.localhost/" 2>/dev/null || echo "000")
assert_match "$WEB_STATUS" "^(200|302)$" "NFA-05" "T4" "Mattermost Web-UI erreichbar"
