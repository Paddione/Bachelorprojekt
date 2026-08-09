#!/usr/bin/env bats
# tests/spec/software-factory/update-status-id-allowlist-T002906.bats
# SSOT: openspec/specs/software-factory.md
#
# PRUEFMODUS: command output verification [T002448-M4]. Die Tests RUFEN
# scripts/ticket.sh update-status auf und pruefen $status und $output — kein grep
# auf die Skriptquelle. Der Allowlist-Guard liegt bewusst VOR _ticket_lock_guard
# und _pgpod, deshalb laufen alle Faelle hier OHNE Cluster.
#
# [T002906] Hintergrund: --id wurde an zwei Stellen roh in SQL interpoliert
# (Guard-SELECT fuer den Terminal-Status-Uebergang und Guard-SELECT fuer
# FACTORY-PLAN-REF). Der Aufrufer ist in der Factory-Pipeline ein LLM-Agent, die
# Eingabe also nicht per Konstruktion vertrauenswuerdig.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

FORMAT_ERR='keine gueltige external_id'

# ── Positiv-Anker ───────────────────────────────────────────────#
# Pflicht bei Negativtests [T002356-M1]: ohne ihn bestuenden die Faelle unten
# vakuos, sobald der Guard versehentlich JEDE Eingabe ablehnt — "Fehler kam" ist
# dann trivial wahr. Dieser Test wird rot, wenn die Regex zu streng wird.
@test "T002906: gueltige external_id passiert den Allowlist-Guard" {
  run bash scripts/ticket.sh update-status --id T002906 --status triage
  # Der Aufruf darf hier aus jedem anderen Grund scheitern (kein Cluster, Lock,
  # Statusregel) — nur NICHT am Formatguard.
  [[ "$output" != *"$FORMAT_ERR"* ]]
}

@test "T002906: siebenstellige ID passiert den Guard (Wachstumsraum)" {
  run bash scripts/ticket.sh update-status --id T1234567 --status triage
  [[ "$output" != *"$FORMAT_ERR"* ]]
}

# ── Negativfaelle ───────────────────────────────────────────────#
@test "T002906: SQL-Injection-Payload wird abgelehnt (exit 2, kein DB-Kontakt)" {
  run bash scripts/ticket.sh update-status --id "T000001' OR '1'='1" --status triage
  [ "$status" -eq 2 ]
  [[ "$output" == *"$FORMAT_ERR"* ]]
}

@test "T002906: Payload mit Statement-Terminator wird abgelehnt" {
  run bash scripts/ticket.sh update-status --id "T000001'; DROP TABLE tickets.tickets; --" --status triage
  [ "$status" -eq 2 ]
  [[ "$output" == *"$FORMAT_ERR"* ]]
}

@test "T002906: Kleinschreibung und Praefixfehler werden abgelehnt" {
  run bash scripts/ticket.sh update-status --id t002906 --status triage
  [ "$status" -eq 2 ]
  [[ "$output" == *"$FORMAT_ERR"* ]]

  run bash scripts/ticket.sh update-status --id 002906 --status triage
  [ "$status" -eq 2 ]
  [[ "$output" == *"$FORMAT_ERR"* ]]
}

@test "T002906: zu kurze Nummer wird abgelehnt" {
  run bash scripts/ticket.sh update-status --id T123 --status triage
  [ "$status" -eq 2 ]
  [[ "$output" == *"$FORMAT_ERR"* ]]
}

# ── Parametrisierung der beiden Guard-Queries ───────────────────#
# Ausnahme vom Output-Prinzip: dass die Queries per psql-Variable binden statt zu
# interpolieren, laesst sich ohne Cluster nicht am Laufzeitverhalten ablesen — der
# Allowlist-Guard oben schneidet jede Eingabe vorher ab. Die Bindung ist die zweite
# Verteidigungslinie und soll bestehen bleiben, auch wenn jemand den Guard lockert;
# deshalb wird sie hier strukturell festgeschrieben.
@test "T002906: beide Guard-SELECTs binden external_id als psql-Variable" {
  local f='scripts/vda/ticket/update-status.sh'
  # Positiv-Anker: die Bindungen sind ueberhaupt vorhanden.
  run bash -c "grep -c \"external_id = :'tid'\" '$f'"
  [ "$status" -eq 0 ]
  [ "$output" -eq 2 ]
  # Negativ: keine rohe Interpolation von \$id in einem SQL-Vergleich mehr.
  run bash -c "grep -cE \"external_id *= *'\\\\\\\$\\{?id\\}?'\" '$f' || true"
  [ "$output" -eq 0 ]
}
