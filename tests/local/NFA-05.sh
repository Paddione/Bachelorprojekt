#!/usr/bin/env bash
# NFA-05: Usability — German locale, accessibility, page load times (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
WEB_NAMESPACE="${WEB_NAMESPACE:-website}"

# T1: Nextcloud default language is German
NC_LANG=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ config:system:get default_language 2>/dev/null || echo "")
assert_eq "$NC_LANG" "de" "NFA-05" "T1" "Nextcloud Default-Sprache ist Deutsch"

# T2: Website loads within 5 seconds
LOGIN_START=$(date +%s%3N)
LOGIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://web.localhost/" 2>/dev/null || echo "000")
LOGIN_DUR=$(( $(date +%s%3N) - LOGIN_START ))
assert_match "$LOGIN_STATUS" "^(200|302)$" "NFA-05" "T2a" "Website erreichbar"
assert_lt "$LOGIN_DUR" 5000 "NFA-05" "T2b" "Website lädt < 5s (war ${LOGIN_DUR}ms)"

# T3: Keycloak login page accessible
KC_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://auth.localhost/realms/workspace/account/" 2>/dev/null || echo "000")
assert_match "$KC_STATUS" "^(200|302)$" "NFA-05" "T3" "Keycloak Login-Seite erreichbar"
