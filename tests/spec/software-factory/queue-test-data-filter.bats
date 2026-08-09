#!/usr/bin/env bats
#
# SSOT: openspec/specs/software-factory.md
# Ticket: T002830 — factory/queue.sh filtert is_test_data nicht
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Die Tests FUEHREN
# scripts/factory/queue.sh gegen die echte Datenbank AUS und pruefen dessen
# JSON-Ausgabe. Es wird NICHT der Quelltext von queue.sh gegreppt.
#
# POSITIV-ANKER (T002356-M1): Test 1 saet eine reguläre backlog-Zeile
# (is_test_data=false, lastenheft_locked=true) und belegt, dass sie im
# queue.sh-Output ERSCHEINT. Erst darauf stuetzt Test 2 die Negativ-Aussage.
# Ohne den Anker bestuende der Negativ-Test vakuos — eine Implementierung,
# die gar nichts mehr zurueckgibt, wuerde ihn ebenfalls bestehen.
#
# Negativ-Fixture: seed_test_feature saet is_test_data=true; die
# lastenheft_locked-Setzung per ticket.sh plan-meta stellt sicher, dass die
# Zeile ALLE Bedingungen der Feature-backlog-Lane erfuellt (nur der
# is_test_data-Filter darf sie ausschliessen — sonst waere der Test vakuos).
#
# Die Fixtures werden in teardown_file wieder entfernt — der Test stuetzt sich
# ausdruecklich NICHT auf liegengebliebene SF-TEST-Zeilen fremder Laeufe.

load "../../lib/factory-test-fixtures.sh"

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen"
}

setup_file() {
  export TICKET_TEST_BRAND="mentolder"
  export TICKET_TEST_DB_OK=1
  export TICKET_CTX="${FACTORY_CTX:-k3d-mentolder-dev}"
  export ANCHOR_ID_FILE="$BATS_FILE_TMPDIR/anchor_id"
  export SEEDED_ID_FILE="$BATS_FILE_TMPDIR/seeded_id"
}

# Loescht eine Zeile gezielt per external_id (funktioniert unabhängig von
# tickets.fn_purge_test_data(), die gegen die lokale k3d-DB wegen fehlender
# Tabelle questionnaire_test_status scheitert — siehe Mishap-Meldung).
_db_delete() {
  local id="$1"
  [[ -n "$id" ]] || return 0
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}" ns="workspace" pod=""
  for candidate_ns in workspace workspace-dev; do
    pod=$(kubectl get pod -n "$candidate_ns" --context "$ctx" \
      -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
      -o name 2>/dev/null | head -1)
    [[ -n "$pod" ]] && { ns="$candidate_ns"; break; }
  done
  [[ -n "$pod" ]] && kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc "DELETE FROM tickets.tickets WHERE external_id='$id';" >/dev/null 2>&1 || true
}

teardown_file() {
  # Beide Fixtures gezielt entfernen — NICHT ueber fn_purge_test_data (kaputt
  # gegen lokale DB, siehe _db_delete-Kommentar).
  _db_delete "$(cat "$ANCHOR_ID_FILE" 2>/dev/null)"
  _db_delete "$(cat "$SEEDED_ID_FILE" 2>/dev/null)"
}

# Saet (einmal pro Datei) die reguläre Anker-Zeile und liefert ihre external_id.
_anchor_once() {
  if [[ ! -s "$ANCHOR_ID_FILE" ]]; then
    local result ext_id
    result=$(BRAND="mentolder" TICKET_CTX="$TICKET_CTX" bash "$BATS_TEST_DIRNAME/../../../scripts/ticket.sh" create \
      --type feature --brand mentolder --title "T002830-Anker-regulaeres-backlog-Feature-$$-${RANDOM}" \
      --description "factory queue test anchor" --priority mittel --status backlog)
    ext_id="${result%%|*}"
    # Feature-backlog-Lane verlangt lastenheft_locked=true — ohne die
    # Readiness-Setzung waere die Zeile in keiner Lane und der Anker wirkungslos.
    BRAND="mentolder" TICKET_CTX="$TICKET_CTX" bash "$BATS_TEST_DIRNAME/../../../scripts/ticket.sh" \
      plan-meta set --id "$ext_id" --readiness lastenheft_locked=true >/dev/null 2>&1 || true
    printf '%s' "$ext_id" > "$ANCHOR_ID_FILE"
  fi
  cat "$ANCHOR_ID_FILE"
}

# Saet (einmal pro Datei) die is_test_data=true-Zeile und liefert ihre external_id.
_seed_once() {
  if [[ ! -s "$SEEDED_ID_FILE" ]]; then
    local ext_id
    ext_id=$(seed_test_feature "mentolder")
    # Dieselbe Readiness wie beim Anker — die Zeile erfuellt die Lane, nur
    # is_test_data unterscheidet sie vom Anker.
    BRAND="mentolder" TICKET_CTX="$TICKET_CTX" bash "$BATS_TEST_DIRNAME/../../../scripts/ticket.sh" \
      plan-meta set --id "$ext_id" --readiness lastenheft_locked=true >/dev/null 2>&1 || true
    printf '%s' "$ext_id" > "$SEEDED_ID_FILE"
  fi
  cat "$SEEDED_ID_FILE"
}

@test "T002830: regulaeres backlog-Feature erscheint in queue.sh (Positiv-Anker)" {
  _skip_if_no_db
  anchor="$(_anchor_once)"
  [ -n "$anchor" ]

  run env BRAND=mentolder FACTORY_CTX="$TICKET_CTX" bash "$BATS_TEST_DIRNAME/../../../scripts/factory/queue.sh"
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e 'type == "array"' >/dev/null

  [ "$(printf '%s' "$output" | jq -r --arg id "$anchor" '[.[] | select(.external_id == $id)] | length')" -eq 1 ]
}

@test "T002830: is_test_data=true-Zeile erscheint NICHT in queue.sh" {
  _skip_if_no_db
  seeded="$(_seed_once)"
  [ -n "$seeded" ]
  # Der Positiv-Anker ist Vorbedingung: nur wenn ein regulaeres Feature sichtbar
  # ist, beweist die Abwesenheit der Test-Zeile etwas (T002356-M1).
  anchor="$(_anchor_once)"
  [ -n "$anchor" ]

  run env BRAND=mentolder FACTORY_CTX="$TICKET_CTX" bash "$BATS_TEST_DIRNAME/../../../scripts/factory/queue.sh"
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e 'type == "array"' >/dev/null

  # Anker weiterhin da (Queue nicht leer), Test-Zeile fehlt.
  [ "$(printf '%s' "$output" | jq -r --arg id "$anchor" '[.[] | select(.external_id == $id)] | length')" -eq 1 ]
  [ "$(printf '%s' "$output" | jq -r --arg id "$seeded" '[.[] | select(.external_id == $id)] | length')" -eq 0 ]
}
