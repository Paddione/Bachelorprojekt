#!/usr/bin/env bats
#
# SSOT: openspec/specs/ticket-system.md
# Ticket: T900243 — `get-timeline` filtert auf nicht existierende Spalte
# ticket_plans.brand
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Der Test fuehrt
# `ticket.sh get-timeline` gegen die echte Datenbank aus und prueft dessen
# JSON-Ausgabe. Kein Source-Grep auf die Query.
#
# URSACHE (verifiziert, nicht geraten): Die `plan_events`-CTE in
# cmd_get_timeline (scripts/ticket.sh) filtert `tickets.ticket_plans` auf
# eine Spalte `brand`, die dort nicht existiert (`tp.branch` waere die naeheste
# reale Spalte, aber eine andere Bedeutung). Reproduktion vor dem Fix:
#   bash scripts/ticket.sh get-timeline --id T900110
#   -> rc=3, "ERROR:  column tp.brand does not exist"
#
# ENTSCHEIDUNG: Die Bedingung wird ersatzlos gestrichen statt `brand` durch
# `branch` zu ersetzen. Die CTE schraenkt bereits ueber
# `tp.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = ...)`
# ein, und `external_id` ist pro Brand eindeutig — ein zusaetzlicher
# Brand-Filter auf dem Plan waere redundant und semantisch falsch am
# Plan-Datensatz verankert (er gehoert, wenn ueberhaupt, aufs Ticket). Die
# uebrigen CTEs (comments, phase_events, pr_links) filtern ebenfalls nur ueber
# den Ticket-Subselect, ohne eigenen Brand-Filter — plan_events zieht damit
# nur nach.
#
# POSITIV-ANKER: T900110 (Brand mentolder) hat einen archivierten Plan
# (plan_ref gesetzt, Status done). Der Test verlangt Exit 0 UND einen
# 'plan_archived'-Eintrag in der Ausgabe — ein Test, der nur "kein Fehler"
# prueft, wuerde auch eine leere Antwort durchwinken (siehe Ticketbeschreibung).

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen"
}

_repo_root() { cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd; }

@test "T900243 Positiv-Anker: get-timeline liefert fuer T900110 Exit 0 UND einen plan_archived-Eintrag" {
  _skip_if_no_db
  local root; root="$(_repo_root)"

  run env BRAND=mentolder bash "$root/scripts/ticket.sh" get-timeline --id T900110
  [ "$status" -eq 0 ]
  printf '%s' "$output" | grep -qF 'plan_archived'
}
