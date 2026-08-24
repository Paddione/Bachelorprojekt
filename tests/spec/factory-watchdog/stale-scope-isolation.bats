#!/usr/bin/env bats
# tests/spec/factory-watchdog/stale-scope-isolation.bats [T015983]
#
# PRÜFMODUS: Output-Verifikation wie stale-type-coverage.bats [T002674] —
# `watchdog.sh --print-stale-query` wird als Kommando gerendert und auf stdout
# geprüft, kein DB-Zugriff (CI-läuferisch und im Störfall benutzbar).
#
# HINTERGRUND: Bis zu diesem Fix bedeutete FACTORY_STALE_EXCLUDE_TEST_SEEDS=0
# "gar kein Test-Filter" — der Stale-Sweep lief dann GLOBAL über die geteilte
# Dev-DB. Die SF-Selbsttests fahren genau diese Kombination mit STALE_MIN=0
# ([T005561]-Klasse) und resetten dabei echte in_progress-Tickets mitten in der
# Ausführung: T015712 wurde am 2026-08-24 dreimal ("stale > 0min", 02:20,
# 03:23:01, 03:23:49 UTC) aus Test-Sweeps zurückgesetzt — Dispatch→Reset→Dispatch-
# Livelock, sekundengenau korrelierend mit den erzeugten SF-TEST/SF-REAL-Fixtures.
#
# FIX-RICHTUNG: zweiseitige Marker-Isolation. Der Sweep erkennt Test-Seeds am
# ticket_comments.author_label='factory-test' (gesetzt von beiden Seed-Funktionen
# in tests/lib/factory-test-fixtures.sh):
#   Betrieb  (unset / =1): NOT EXISTS marker → Seeds unsichtbar, echte Tickets sichtbar
#   Testmodus          =0: EXISTS    marker → NUR Seeds sichtbar, echte Tickets immun
# Damit kann ein Test-Sweep strukturell nie wieder ein Produktionstupor antasten.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  WD="$REPO_ROOT/scripts/factory/watchdog.sh"
}

@test "T015983: Betrieb-Sweep schließt factory-test-Marker aus (unset env)" {
  run bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Positiv-Anker [T002356-M1]: der Isolationsmechanismus muss überhaupt in der
  # Query stecken — gegen eine filterlose Zeile wäre jede Aussage trivial wahr.
  [[ "$output" == *"author_label = 'factory-test'"* ]]

  # Kern: Betrieb exkludiert markierte Rows.
  [[ "$output" == *"NOT EXISTS"* ]]
}

@test "T015983: EXCLUDE_TEST_SEEDS=1 bleibt Betrieb-Semantik (NOT EXISTS)" {
  run env FACTORY_STALE_EXCLUDE_TEST_SEEDS=1 bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [ -n "$output" ]
  # Anker mit "AND "-Präfix: der nackte "EXISTS"-Substring steckt auch in
  # "NOT EXISTS" und wäre als Negativ-Check trivial falsch.
  [[ "$output" == *"AND NOT EXISTS (SELECT 1 FROM tickets.ticket_comments"* ]]
  [[ "$output" != *"AND EXISTS (SELECT 1 FROM tickets.ticket_comments"* ]]
}

@test "T015983: EXCLUDE_TEST_SEEDS=0 ist Test-Scope — NUR markierte Rows (EXISTS)" {
  # Genau die Kombination aus scheduling.bats/orphan-slot-reap.bats: ohne den
  # Flip würde dieser Lauf global sweepen und echte Tickets treffen.
  run env FACTORY_STALE_MIN=0 FACTORY_ALLOW_STALE_MIN_ZERO=1 \
    FACTORY_STALE_EXCLUDE_TEST_SEEDS=0 bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [[ "$output" == *"AND EXISTS (SELECT 1 FROM tickets.ticket_comments c WHERE c.ticket_id = tickets.tickets.id AND c.author_label = 'factory-test')"* ]]
  [[ "$output" != *"AND NOT EXISTS"* ]]
}

@test "T015983: Test-Scope bei STALE_MIN=0 rendert make_interval(mins => 0)" {
  # Regressionssicherung für den Vorfall: der Test-Scope MUSS die Schwelle 0
  # unverändert durchreichen (die Tests brauchen sie), damit die Isolation über
  # den Marker läuft — nicht über eine heimlich angehobene Schwelle.
  run env FACTORY_STALE_MIN=0 FACTORY_ALLOW_STALE_MIN_ZERO=1 \
    FACTORY_STALE_EXCLUDE_TEST_SEEDS=0 bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [[ "$output" == *"make_interval(mins => 0)"* ]]
}
