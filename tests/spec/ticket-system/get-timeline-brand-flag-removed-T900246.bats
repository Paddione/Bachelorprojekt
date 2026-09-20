#!/usr/bin/env bats
#
# SSOT: openspec/specs/ticket-system.md
# Ticket: T900246 — cmd_get_timeline's --brand/BRAND flag ist seit T900243
# vestigial: geparst, defaultet, als psql-Variable :'brand' gebunden, aber in
# keiner Query mehr referenziert (die AND tp.brand = :'brand'-Bedingung wurde
# in T900243 ersatzlos gestrichen).
#
# ENTSCHEIDUNG: --brand wird end-to-end entfernt statt in eine
# Brand-Mismatch-Pruefung umgewandelt. Beleg: tickets.tickets.external_id ist
# `TEXT UNIQUE` (components/website/src/lib/tickets/tables/tickets.ts:14) —
# eine GLOBALE Sequenz (tickets.external_id_seq), keine Brand-Eingrenzung.
# Zwei Brands koennen dieselbe external_id NICHT tragen, also ist ein
# --brand-Mismatch fuer ein existierendes external_id ein logisch
# unmoegliches Szenario. openspec/specs/ticket-system.md:1571-1578
# dokumentiert bereits, dass die Brand-Eingrenzung transitiv ueber den
# external_id-Subselect erfolgt.
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Beide Tests fuehren
# `ticket.sh get-timeline` tatsaechlich aus und pruefen Exit-Code + Ausgabe.
# Kein Source-Grep auf die Query. Kein Cluster-Zugriff noetig: die
# Options-Schleife von cmd_get_timeline lehnt ein unbekanntes Flag ab, BEVOR
# sie den DB-Pod aufloest — und `get-timeline --help` liest nur den
# eingebetteten Hilfetext.

_repo_root() { cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd; }

@test "T900246 Positiv-Anker: get-timeline funktioniert weiterhin, lehnt --brand aber als unbekannte Option ab" {
  local root; root="$(_repo_root)"

  # Positiv-Anker zuerst: ohne --brand funktioniert der Aufruf weiterhin
  # (TICKET_OFFLINE=1 vermeidet Cluster-Zugriff; der Offline-Pfad wird erst
  # NACH der Options-Schleife erreicht, ist also selbst der Positiv-Beleg,
  # dass die Options-Schleife --id ohne --brand klaglos durchlaesst).
  run env TICKET_OFFLINE=1 bash "$root/scripts/ticket.sh" get-timeline --id T900239
  [ "$status" -eq 9 ]
  printf '%s' "$output" | grep -qF 'OFFLINE: refused read get-timeline'

  # Negativ-Aussage: --brand wird nicht mehr akzeptiert. Ein gueltiger
  # Brand-Wert (korczewski) besteht die globale Top-Level-Enum-Validierung
  # (scripts/ticket.sh:96-98) problemlos, damit die Assertion tatsaechlich
  # die Options-Schleife von cmd_get_timeline trifft und nicht die davor
  # liegende globale BRAND-Validierung.
  run env TICKET_OFFLINE=1 bash "$root/scripts/ticket.sh" get-timeline --id T900239 --brand korczewski
  [ "$status" -eq 2 ]
  printf '%s' "$output" | grep -qF 'Unknown get-timeline option: --brand'
}

@test "T900246 Positiv-Anker: get-timeline --help dokumentiert --id, aber nicht mehr --brand" {
  local root; root="$(_repo_root)"

  run bash "$root/scripts/ticket.sh" get-timeline --help
  [ "$status" -eq 0 ]
  printf '%s' "$output" | grep -qF -- '--id <external_id>'
  local brand_mentions; brand_mentions="$(printf '%s' "$output" | grep -cF -- '--brand' || true)"
  [ "$brand_mentions" -eq 0 ]
}
