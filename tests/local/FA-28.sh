#!/usr/bin/env bash
# FA-28: Website-Messaging (internes Chat-System) — Threads, Rooms, Portalnachrichten
# Ersetzt die Mattermost-Tests FA-01/FA-02 mit dem neuen, in die Website integrierten System.
# Tests:
#   T1 — Website pod running
#   T2 — /api/portal/messages unauthenticated → 401 (Endpoint existiert)
#   T3 — /api/admin/messages unauthenticated → 401 (Endpoint existiert)
#   T4 — /api/admin/rooms unauthenticated → 401 (Endpoint existiert)
#   T5 — POST /api/portal/messages mit leerem Body → 401/400 (Validierung aktiv)
#   T6 — Website DB (SESSIONS_DATABASE_URL) konfiguriert
#   T7 — messaging-Tabellen im website-Schema vorhanden
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/assert.sh
source "${SCRIPT_DIR}/lib/assert.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"
NAMESPACE="${NAMESPACE:-workspace}"

# ── T1: Website pod running ───────────────────────────────────────
WEB_READY=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${WEB_READY:-0}" 0 "FA-28" "T1" "Website-Deployment laeuft (readyReplicas > 0)"

# ── T2: /api/portal/messages → 401 ───────────────────────────────
if [[ "${WEB_READY:-0}" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider http://localhost:4321/api/portal/messages 2>&1 \
    | grep -m1 "HTTP/" | awk '{print $2}' || echo "0")
  assert_eq "${CODE:-0}" "401" "FA-28" "T2" "/api/portal/messages schützt unauthentisierte Anfragen (HTTP 401)"
else
  skip_test "FA-28" "T2" "/api/portal/messages" "Website nicht bereit"
fi

# ── T3: /api/admin/messages → 401 ────────────────────────────────
if [[ "${WEB_READY:-0}" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider http://localhost:4321/api/admin/messages 2>&1 \
    | grep -m1 "HTTP/" | awk '{print $2}' || echo "0")
  assert_eq "${CODE:-0}" "401" "FA-28" "T3" "/api/admin/messages schützt unauthentisierte Anfragen (HTTP 401)"
else
  skip_test "FA-28" "T3" "/api/admin/messages" "Website nicht bereit"
fi

# ── T4: /api/admin/rooms → 401 ───────────────────────────────────
if [[ "${WEB_READY:-0}" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider http://localhost:4321/api/admin/rooms 2>&1 \
    | grep -m1 "HTTP/" | awk '{print $2}' || echo "0")
  assert_eq "${CODE:-0}" "401" "FA-28" "T4" "/api/admin/rooms schützt unauthentisierte Anfragen (HTTP 401)"
else
  skip_test "FA-28" "T4" "/api/admin/rooms" "Website nicht bereit"
fi

# ── T5: POST /api/portal/messages ohne Body → 401 ────────────────
if [[ "${WEB_READY:-0}" -gt 0 ]]; then
  CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --post-data='{"body":"test"}' \
    --header='Content-Type: application/json' \
    http://localhost:4321/api/portal/messages 2>&1 \
    | grep -m1 "HTTP/" | awk '{print $2}' || echo "0")
  # 401 expected (no session) — auth check comes before body parsing
  assert_eq "${CODE:-0}" "401" "FA-28" "T5" "POST /api/portal/messages ohne Session wird abgewiesen (HTTP 401)"
else
  skip_test "FA-28" "T5" "POST /api/portal/messages Auth-Check" "Website nicht bereit"
fi

# ── T6: Website-Datenbankverbindung konfiguriert ──────────────────
DB_URL=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="SESSIONS_DATABASE_URL")].value}' \
  2>/dev/null || echo "")
assert_gt "${#DB_URL}" 0 "FA-28" "T6" "SESSIONS_DATABASE_URL in Website-Deployment konfiguriert"

# ── T7: message_threads Tabelle in website-DB vorhanden ──────────
TABLE_EXISTS=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U postgres -d website -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='message_threads';" \
  2>/dev/null || echo "0")
assert_eq "${TABLE_EXISTS:-0}" "1" "FA-28" "T7" "message_threads-Tabelle in website-DB vorhanden"
