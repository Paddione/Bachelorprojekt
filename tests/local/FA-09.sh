#!/usr/bin/env bash
# FA-09: Buchhaltung — Invoice Ninja CRUD und SSO-Integration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
IN_URL="http://invoiceninja:80"
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/invoiceninja -c invoiceninja -- curl -s "$@" 2>/dev/null; }

# ── Get Invoice Ninja API token ─────────────────────────────────
IN_TOKEN=$(kubectl get secret workspace-secrets -n "$NAMESPACE" -o jsonpath='{.data.INVOICENINJA_API_TOKEN}' 2>/dev/null | base64 -d)

_in_api() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s -X "$method" -H "X-API-TOKEN: ${IN_TOKEN}" -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest")
  [[ -n "$data" ]] && args+=(-d "$data")
  _kube_curl "${args[@]}" "${IN_URL}${path}"
}

# ── Group A: Invoice Ninja API (CRUD) ──────────────────────────

if [[ -z "$IN_TOKEN" ]]; then
  skip_test "FA-09" "T1" "Invoice Ninja API erreichbar" "Kein API-Token"
  skip_test "FA-09" "T2" "Kunde anlegen via API" "Kein API-Token"
  skip_test "FA-09" "T3" "Kunde abrufen via API" "Kein API-Token"
  skip_test "FA-09" "T4" "Rechnung erstellen via API" "Kein API-Token"
  skip_test "FA-09" "T5" "Angebot erstellen via API" "Kein API-Token"
  skip_test "FA-09" "T6" "Ausgabe erfassen via API" "Kein API-Token"
  skip_test "FA-09" "T7" "Rechnungsliste abrufen" "Kein API-Token"
  skip_test "FA-09" "T8" "Kunde löschen via API" "Kein API-Token"
else
  # T1: API erreichbar
  API_STATUS=$(_kube_curl -o /dev/null -w '%{http_code}' \
    -H "X-API-TOKEN: ${IN_TOKEN}" -H "X-Requested-With: XMLHttpRequest" \
    "${IN_URL}/api/v1/clients?per_page=1")
  assert_eq "$API_STATUS" "200" "FA-09" "T1" "Invoice Ninja API erreichbar"

  # T2: Kunde anlegen
  CLIENT_RESP=$(_in_api POST "/api/v1/clients" '{
    "name":"Test-Kunde FA-09",
    "address1":"Teststr. 1",
    "city":"Berlin",
    "postal_code":"10115",
    "country_id":"276",
    "vat_number":"DE999999999",
    "contacts":[{"first_name":"Test","last_name":"Kontakt","email":"test@fa09.local"}]
  }')
  CLIENT_ID=$(echo "$CLIENT_RESP" | jq -r '.data.id // empty')
  CLIENT_NAME=$(echo "$CLIENT_RESP" | jq -r '.data.name // empty')
  assert_eq "$CLIENT_NAME" "Test-Kunde FA-09" "FA-09" "T2" "Kunde anlegen via API"

  # T3: Kunde abrufen
  if [[ -n "$CLIENT_ID" ]]; then
    GET_CLIENT=$(_in_api GET "/api/v1/clients/${CLIENT_ID}")
    GET_NAME=$(echo "$GET_CLIENT" | jq -r '.data.name // empty')
    GET_VAT=$(echo "$GET_CLIENT" | jq -r '.data.vat_number // empty')
    assert_eq "$GET_NAME" "Test-Kunde FA-09" "FA-09" "T3a" "Kunde abrufen — Name korrekt"
    assert_eq "$GET_VAT" "DE999999999" "FA-09" "T3b" "Kunde abrufen — USt-IdNr. korrekt"
  else
    skip_test "FA-09" "T3a" "Kunde abrufen — Name" "Client-Erstellung fehlgeschlagen"
    skip_test "FA-09" "T3b" "Kunde abrufen — USt-IdNr." "Client-Erstellung fehlgeschlagen"
  fi

  # T4: Rechnung erstellen (Server Error in Notification ist bekannt — prüfe ob Rechnung trotzdem in DB)
  if [[ -n "$CLIENT_ID" ]]; then
    _in_api POST "/api/v1/invoices" "{
      \"client_id\":\"${CLIENT_ID}\",
      \"date\":\"$(date +%Y-%m-%d)\",
      \"due_date\":\"$(date -d '+30 days' +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)\",
      \"line_items\":[{\"product_key\":\"TEST\",\"notes\":\"Test-Position\",\"cost\":100,\"quantity\":2}]
    }" > /dev/null 2>&1
    # Check if invoice was created despite notification error
    sleep 1
    LATEST_INV=$(_in_api GET "/api/v1/invoices?per_page=1&sort=created_at|desc&client_id=${CLIENT_ID}")
    INV_ID=$(echo "$LATEST_INV" | jq -r '.data[0].id // empty')
    assert_gt "${#INV_ID}" "0" "FA-09" "T4" "Rechnung erstellt (in DB vorhanden)"
  else
    skip_test "FA-09" "T4" "Rechnung erstellen" "Kein Client"
  fi

  # T5: Angebot erstellen
  if [[ -n "$CLIENT_ID" ]]; then
    _in_api POST "/api/v1/quotes" "{
      \"client_id\":\"${CLIENT_ID}\",
      \"date\":\"$(date +%Y-%m-%d)\",
      \"line_items\":[{\"product_key\":\"ANGEBOT\",\"notes\":\"Test-Angebot\",\"cost\":500,\"quantity\":1}]
    }" > /dev/null 2>&1
    sleep 1
    LATEST_QUOTE=$(_in_api GET "/api/v1/quotes?per_page=1&sort=created_at|desc&client_id=${CLIENT_ID}")
    QUOTE_ID=$(echo "$LATEST_QUOTE" | jq -r '.data[0].id // empty')
    assert_gt "${#QUOTE_ID}" "0" "FA-09" "T5" "Angebot erstellt (in DB vorhanden)"
  else
    skip_test "FA-09" "T5" "Angebot erstellen" "Kein Client"
  fi

  # T6: Ausgabe erfassen
  EXP_RESP=$(_in_api POST "/api/v1/expenses" '{
    "amount":42.50,
    "public_notes":"Test-Ausgabe FA-09",
    "date":"'"$(date +%Y-%m-%d)"'"
  }')
  EXP_ID=$(echo "$EXP_RESP" | jq -r '.data.id // empty')
  assert_gt "${#EXP_ID}" "0" "FA-09" "T6" "Ausgabe erfassen via API"

  # T7: Rechnungsliste abrufen
  INV_LIST=$(_in_api GET "/api/v1/invoices?per_page=5")
  INV_COUNT=$(echo "$INV_LIST" | jq '.data | length')
  assert_gt "$INV_COUNT" "0" "FA-09" "T7" "Rechnungsliste enthält Einträge"

  # T8: Aufräumen — Test-Daten löschen
  CLEANUP_OK="true"
  [[ -n "$INV_ID" ]] && _in_api DELETE "/api/v1/invoices/${INV_ID}" > /dev/null 2>&1 || CLEANUP_OK="false"
  [[ -n "$QUOTE_ID" ]] && _in_api DELETE "/api/v1/quotes/${QUOTE_ID}" > /dev/null 2>&1 || true
  [[ -n "$EXP_ID" ]] && _in_api DELETE "/api/v1/expenses/${EXP_ID}" > /dev/null 2>&1 || true
  [[ -n "$CLIENT_ID" ]] && _in_api DELETE "/api/v1/clients/${CLIENT_ID}" > /dev/null 2>&1 || CLEANUP_OK="false"
  assert_eq "$CLEANUP_OK" "true" "FA-09" "T8" "Test-Daten aufgeräumt (Rechnung + Kunde gelöscht)"
fi
