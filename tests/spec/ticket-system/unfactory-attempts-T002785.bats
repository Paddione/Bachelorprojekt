#!/usr/bin/env bats
# tests/spec/ticket-system/unfactory-attempts-T002785.bats
# T002785 Befund 1 — scripts/ticket.sh --attempts-Validierung scheitert bei
# regulaerer Nutzung. Der Watchdog-Eskalationspfad ruft
#   ticket.sh unfactory --id TXXXX --attempts "<failure_class>-<n>"
# auf (z.B. INFRA-3, MODEL-2, siehe scripts/factory/watchdog.sh:178 und T002389).
# Die Validierung akzeptierte nur reine Ziffern (^[0-9]+$) und liess den
# klassifizierten Aufruf mit exit 2 scheitern — der Terminal-State
# (blocked + factory_excluded) wurde damit nie gesetzt, obwohl der
# Attempt-Zaehler die Schwelle ueberschritten hatte.
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4) via CLI, TICKET_OFFLINE=1
# hält den Lauf clusterfrei deterministisch (Validierung laeuft VOR der
# Offline-Skip-Pruefung in cmd_unfactory).

TICKET_SH="scripts/ticket.sh"

@test "T002785-1: unfactory akzeptiert klassifizierten Attempts-Wert (INFRA-3)" {
  run env TICKET_OFFLINE=1 bash "$TICKET_SH" unfactory --id T009999 --attempts INFRA-3
  # Vor dem Fix: exit 2 aus der Validierung. Nach dem Fix passiert die
  # Validierung, danach greift die Offline-Skip-Pruefung mit exit 0.
  [ "$status" -eq 0 ] || { echo "klassifizierter Attempts-Wert abgelehnt: $output"; false; }
}

@test "T002785-1: unfactory akzeptiert klassifizierten Attempts-Wert (MODEL-2)" {
  run env TICKET_OFFLINE=1 bash "$TICKET_SH" unfactory --id T009999 --attempts MODEL-2
  [ "$status" -eq 0 ] || { echo "klassifizierter Attempts-Wert abgelehnt: $output"; false; }
}

@test "T002785-1: unfactory akzeptiert weiterhin reinen Integer (0, 3)" {
  run env TICKET_OFFLINE=1 bash "$TICKET_SH" unfactory --id T009999 --attempts 0
  [ "$status" -eq 0 ] || { echo "0 abgelehnt: $output"; false; }
  run env TICKET_OFFLINE=1 bash "$TICKET_SH" unfactory --id T009999 --attempts 3
  [ "$status" -eq 0 ] || { echo "3 abgelehnt: $output"; false; }
}

@test "T002785-1: unfactory lehnt weiterhin ungueltige Werte ab (Negativtest mit Positiv-Anker)" {
  # Negativ-Anker: offensichtlich kaputte Werte bleiben hart abgelehnt —
  # sonst waere die gelockerte Validierung vakuos.
  run env TICKET_OFFLINE=1 bash "$TICKET_SH" unfactory --id T009999 --attempts -3
  [ "$status" -eq 2 ] || { echo "-3 wurde nicht abgelehnt: $output"; false; }
  run env TICKET_OFFLINE=1 bash "$TICKET_SH" unfactory --id T009999 --attempts abc
  [ "$status" -eq 2 ] || { echo "abc wurde nicht abgelehnt: $output"; false; }
  run env TICKET_OFFLINE=1 bash "$TICKET_SH" unfactory --id T009999 --attempts "3-INFRA"
  [ "$status" -eq 2 ] || { echo "3-INFRA wurde nicht abgelehnt: $output"; false; }
}
