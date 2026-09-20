#!/usr/bin/env bats
# tests/spec/ticket-system/areas-csv-trim.bats
# SSOT: openspec/changes/areas-csv-trim/specs/ticket-system.md (T004894)
#
# PRUEFMODUS (T002448-M4): Output-/Resultat-Verifikation gegen die reale Dev-DB.
# Der Test FUEHRT `ticket.sh plan-meta set` bzw. `ticket.sh create` mit einer
# Komma-Liste MIT Leerzeichen aus und prueft das gespeicherte Array per psql.
# Kein Source-Grep — die Assertion haengt an der Semantik des gespeicherten
# Werts (T002716).
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/areas-csv-trim.bats

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  # [T900250] CTX spiegelt EXAKT die Kontext-Aufloesung, die scripts/ticket.sh
  # selbst benutzt (scripts/vda/ticket/_ticket-core.sh:11: CTX="${TICKET_CTX:-fleet}").
  # Vorher stand hier FACTORY_CTX:-devmesh — eine andere Variable mit einem
  # anderen Default. ticket.sh create schrieb dadurch nach fleet, waehrend
  # teardown gegen devmesh loeschte: der Teardown meldete Erfolg und traf nichts.
  CTX="${TICKET_CTX:-fleet}"
  NS="workspace"
  TESTROW_TITLE="T004894 areas-csv-trim testrow"
  # [T002871] Opt-in: biegt den T002224-Guard in _ticket-core.sh auf den Dev-Kontext.
  export TICKET_TEST_DB_OK=1
}

teardown() {
  # Sicherheitsnetz: raeumt die praeparierte Zeile auch bei fehlgeschlagenem Test ab.
  if cluster_running; then
    local pod
    pod="$(pgpod)" || return 0
    [ -n "$pod" ] || return 0
    kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
      psql -U website -d website -qtA \
      -c "DELETE FROM tickets.tickets WHERE title = '${TESTROW_TITLE}';" >/dev/null 2>&1 || true
  fi
}

cluster_running() {
  kubectl --context "$CTX" get nodes >/dev/null 2>&1
}

pgpod() {
  kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1
}

psql_q() {
  local pod
  pod="$(pgpod)"
  [ -n "$pod" ] || return 1
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 -c "$1"
}

@test "T004894: plan-meta set trims comma-separated areas items" {
  cluster_running || skip "k3d-Cluster nicht erreichbar (${CTX})"

  # Test-Ticket anlegen und external_id ermitteln
  local out ext_id
  out="$(bash "$REPO_ROOT/scripts/ticket.sh" create \
    --type fix --brand mentolder \
    --title "$TESTROW_TITLE" --description "T004894 testrow" \
    --status triage --severity trivial --priority niedrig 2>&1)" || { echo "create fehlgeschlagen: $out" >&2; return 1; }
  ext_id="$(echo "$out" | cut -d'|' -f1)"
  [ -n "$ext_id" ] || { echo "keine external_id: $out" >&2; return 1; }

  # Komma-Liste MIT Leerzeichen setzen — der Defekt (fehlender Trim) zeigt sich
  # als Array-Eintrag mit fuehrendem Leerzeichen.
  run bash "$REPO_ROOT/scripts/ticket.sh" plan-meta set --id "$ext_id" --areas "tickets, db"
  [ "$status" -eq 0 ] || { echo "plan-meta fehlgeschlagen: $output" >&2; return 1; }

  local stored
  stored="$(psql_q "SELECT areas::text FROM tickets.tickets WHERE external_id = '${ext_id}';")"
  echo "gespeichert: $stored"
  [ "$stored" = "{tickets,db}" ]
}

@test "T004894: create trims comma-separated areas items" {
  cluster_running || skip "k3d-Cluster nicht erreichbar (${CTX})"

  local out ext_id
  out="$(bash "$REPO_ROOT/scripts/ticket.sh" create \
    --type fix --brand mentolder \
    --title "$TESTROW_TITLE" --description "T004894 testrow" \
    --areas "tickets, db" --status triage --severity trivial --priority niedrig 2>&1)" \
    || { echo "create fehlgeschlagen: $out" >&2; return 1; }
  ext_id="$(echo "$out" | cut -d'|' -f1)"
  [ -n "$ext_id" ] || { echo "keine external_id: $out" >&2; return 1; }

  local stored
  stored="$(psql_q "SELECT areas::text FROM tickets.tickets WHERE external_id = '${ext_id}';")"
  echo "gespeichert: $stored"
  [ "$stored" = "{tickets,db}" ]
}

@test "T900250: teardown actually deletes the testrow from the DB ticket.sh wrote to" {
  local real_ctx="${TICKET_CTX:-fleet}"
  kubectl --context "$real_ctx" get nodes >/dev/null 2>&1 || skip "k3d-Cluster nicht erreichbar (${real_ctx})"

  local out ext_id
  out="$(bash "$REPO_ROOT/scripts/ticket.sh" create \
    --type fix --brand mentolder \
    --title "$TESTROW_TITLE" --description "T900250 teardown-anchor testrow" \
    --status triage --severity trivial --priority niedrig --is-test-data 2>&1)" \
    || { echo "create fehlgeschlagen: $out" >&2; return 1; }
  ext_id="$(echo "$out" | cut -d'|' -f1)"
  [ -n "$ext_id" ] || { echo "keine external_id: $out" >&2; return 1; }

  # Teardown vorziehen statt auf den impliziten bats-Aufruf danach zu warten —
  # der Anker prueft direkt im Anschluss.
  teardown

  # POSITIV-ANKER (T900250): Abfrage gegen den Kontext, in den ticket.sh
  # TATSAECHLICH schreibt ($real_ctx = derselbe Default wie _ticket-core.sh:
  # TICKET_CTX:-fleet), NICHT gegen die (frueher falsche) Testvariable $CTX.
  # Ein Test, der hier $CTX statt $real_ctx abfraegt, wuerde denselben Defekt
  # erneut durchwinken — genau das war der urspruengliche Bug (T900250).
  local pod remaining
  pod="$(kubectl get pod -n "$NS" --context "$real_ctx" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1)"
  [ -n "$pod" ] || { echo "kein shared-db-Pod in Kontext ${real_ctx}" >&2; return 1; }
  remaining="$(kubectl exec -i "$pod" -n "$NS" --context "$real_ctx" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM tickets.tickets WHERE title = '${TESTROW_TITLE}';")"
  echo "verbleibend in ${real_ctx}: $remaining" >&2
  [ "$remaining" = "0" ]
}
