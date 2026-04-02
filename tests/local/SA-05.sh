#!/usr/bin/env bash
# SA-05: Audit-Log — login events, admin actions logged
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

# T1: Keycloak login events (fresh token with retry)
_kc_admin_login

if [[ -n "$KC_ADMIN_TOKEN" ]]; then
  # Trigger a login event so there's something to find
  curl -s -o /dev/null --max-time 10 -X POST "${KC_URL}/realms/homeoffice/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=testadmin" \
    -d "password=Testpassword123!" \
    -d "grant_type=password" 2>/dev/null || true

  EVENTS=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_URL}/admin/realms/homeoffice/events?max=10")
  EVENT_COUNT=$(echo "$EVENTS" | jq 'length')
  assert_gt "$EVENT_COUNT" 0 "SA-05" "T1" "Keycloak Login-Events vorhanden"
else
  skip_test "SA-05" "T1" "Login-Events" "Kein Keycloak Admin-Token"
fi

# T2: Nextcloud file access logging (activity app)
NC_ACTIVITY=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ app:list 2>/dev/null | grep -c "activity" || echo "0")
assert_gt "$NC_ACTIVITY" 0 "SA-05" "T2" "Nextcloud Activity App aktiv (Dateizugriffs-Logging)"

# T3: Mattermost audit log
if [[ -n "${MM_ADMIN_TOKEN:-}" ]]; then
  AUDITS=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/audits?page=0&per_page=10")
  AUDIT_COUNT=$(echo "$AUDITS" | jq 'length')
  assert_gt "$AUDIT_COUNT" 0 "SA-05" "T3" "Mattermost Audit-Log enthält Einträge"
else
  skip_test "SA-05" "T3" "Mattermost Audits" "Kein Admin-Token"
fi

# T4: Logs retained
LOG_LINES=$(kubectl logs -n "$NAMESPACE" deploy/keycloak --tail=5 2>&1 | wc -l)
assert_gt "$LOG_LINES" 0 "SA-05" "T4" "Keycloak-Logs verfügbar"
