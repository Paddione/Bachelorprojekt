#!/usr/bin/env bats
#
# SSOT: openspec/specs/e2e-test-infrastructure.md
# Ticket: T002894 — tickets.fn_purge_test_data() bricht auf DBs ohne
# questionnaire_test_status komplett ab und purgt dadurch NICHTS.
#
# PRUEFMODUS: Command-Output-/Ergebnis-Verifikation (T002448-M4). Der Test SAET
# eine echte Testdaten-Zeile, RUFT den Teardown-Pfad (purge_factory_test_data,
# der intern tickets.fn_purge_test_data() aufruft) tatsaechlich AUF und PRUEFT
# per Datenbank-Query, ob die Zeile danach weg ist. Kein grep auf die
# Funktionsquelle.
#
# POSITIV-ANKER (T002356-M1): Vor dem Purge wird per direkter SQL-Query belegt,
# dass die gesaete Zeile existiert und is_test_data=true traegt. Erst darauf
# stuetzt sich die Negativ-Aussage danach — ohne den Anker waere ein bereits
# leeres Ergebnis (z.B. weil seed_test_feature fehlschlaegt) fuer beide Tests
# faelschlich gruen.
#
# Hintergrund (siehe design.md dieses Tickets): auf der lokalen k3d-Dev-DB
# existiert questionnaire_test_status nicht (Schema-Drift gegenueber Fleet
# mentolder). Der allererste Schritt von fn_purge_test_data() sprach diese
# Tabelle bisher ungeprueft an -> Exception -> PL/pgSQL bricht ab -> alle 12
# nachfolgenden Sweep-Schritte laufen nicht -> is_test_data=true-Zeilen bleiben
# liegen. Dieser Test laeuft bewusst gegen die reale lokale Cluster-DB (nicht
# gemockt), weil genau diese Kombination (Tabelle fehlt + Funktion aufgerufen)
# das beobachtete Verhalten ist.

load "../../lib/factory-test-fixtures.sh"

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen"
}

# _qts_row_count <external_id> — zaehlt tickets.tickets-Zeilen mit dieser
# external_id, die noch is_test_data=true tragen. Nutzt dieselbe
# Pod-Aufloesung wie purge_factory_test_data() (tests/lib/factory-test-fixtures.sh),
# damit Seed/Purge/Verify garantiert gegen dieselbe DB laufen.
_ticket_row_count() {
  local ext_id="$1"
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}" ns="workspace" pod candidate_ns
  for candidate_ns in "workspace" "workspace-dev"; do
    pod=$(kubectl get pod -n "$candidate_ns" --context "$ctx" \
      -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
      -o name 2>/dev/null | head -1)
    [[ -n "$pod" ]] && { ns="$candidate_ns"; break; }
  done
  [[ -z "$pod" ]] && { echo "-1"; return 1; }
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc \
    "SELECT count(*) FROM tickets.tickets WHERE external_id = '${ext_id}' AND is_test_data = true;"
}

setup_file() {
  export TICKET_TEST_BRAND="mentolder"
  export SEEDED_ID_FILE="$BATS_FILE_TMPDIR/seeded_id"
  # Siehe tests/spec/ticket-system/list-test-data-filter.bats fuer die
  # Begruendung dieses expliziten Opt-ins gegen den BATS-Sentinel-Kontext.
  export TICKET_TEST_DB_OK=1
}

teardown_file() {
  purge_factory_test_data "mentolder" >/dev/null 2>&1 || true
}

@test "T002894: gesaete Testdaten-Zeile existiert vor dem Purge (Positiv-Anker)" {
  _skip_if_no_db
  seeded="$(seed_test_feature "mentolder")"
  echo "$seeded" > "$SEEDED_ID_FILE"
  [ -n "$seeded" ]

  count="$(_ticket_row_count "$seeded")"
  [ "$count" -eq 1 ]
}

@test "T002894: fn_purge_test_data() raeumt die Zeile ab, obwohl questionnaire_test_status lokal fehlt" {
  _skip_if_no_db
  [ -s "$SEEDED_ID_FILE" ]
  seeded="$(cat "$SEEDED_ID_FILE")"

  # Vorbedingung erneut absichern (falls Testreihenfolge/-auswahl abweicht).
  [ "$(_ticket_row_count "$seeded")" -eq 1 ]

  run purge_factory_test_data "mentolder"
  [ "$status" -eq 0 ]

  # Eigentliche Aussage: die Zeile ist nach dem Purge weg — nicht nur "irgendein"
  # Aufruf ist durchgelaufen, sondern der Sweep hat tatsaechlich gewirkt.
  [ "$(_ticket_row_count "$seeded")" -eq 0 ]
}
