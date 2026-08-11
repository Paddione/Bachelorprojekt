#!/usr/bin/env bats
# tests/spec/factory/watchdog-red-green.bats
# Ticket: T003487 — Factory RED-Phase-Abbruch: Watchdog Attempt-Counter zählt
# entered-Events als Fortschritt
#
# Design:
#   Der Watchdog's prog CTE zählt nur phase events mit state IN
#   ('done', 'partial-done', 'blocked') als echten Fortschritt. Ein blosses
#   'entered'-Event (ohne matching completion) SHALL den Counter NICHT
#   zurücksetzen.

WD="scripts/factory/watchdog.sh"

# ─────────────────────────────────────────────────────────────────────────────
# Szenario 1: prog CTE filtert entered-Events aus
# ─────────────────────────────────────────────────────────────────────────────

@test "T003487-1: prog CTE enthält state-Filter für done/partial-done/blocked" {
  # Der WHERE state IN Filter MUSS nach der prog-CTE JOIN-Zeile stehen
  grep -q "WHERE pe.state IN ('done', 'partial-done', 'blocked')" "$WD"
}

@test "T003487-1: prog CTE filtert NICHT auf entered" {
  # 'entered' DARF NICHT im state-Filter der prog CTE auftauchen
  # Aber das Wort 'entered' kommt natürlich in Kommentaren vor — wir prüfen
  # dass der WHERE-Filter kein 'entered' listet.
  run grep "'entered'" "$WD"
  [ "$status" -ne 0 ]
}

# ─────────────────────────────────────────────────────────────────────────────
# Szenario 2/3/4: done, partial-done, blocked zählen als Fortschritt
# ─────────────────────────────────────────────────────────────────────────────

@test "T003487-2: partial-done ist im state-Filter" {
  grep -q "'partial-done'" "$WD"
}

@test "T003487-3: done ist im state-Filter" {
  grep -q "'done'" "$WD"
}

@test "T003487-4: blocked ist im state-Filter" {
  grep -q "'blocked'" "$WD"
}

# ─────────────────────────────────────────────────────────────────────────────
# Spec-Konsistenz
# ─────────────────────────────────────────────────────────────────────────────

@test "T003487-spec: software-factory.md spezifiziert state-Filter" {
  run grep -q "state IN ('done', 'partial-done', 'blocked')" openspec/specs/software-factory.md
  [ "$status" -eq 0 ]
}

# ─────────────────────────────────────────────────────────────────────────────
# Regression: bestehende Counter-Logik bleibt intakt
# ─────────────────────────────────────────────────────────────────────────────

@test "T003487-reg: watchdog.sh hat noch die prog CTE" {
  grep -q 'prog AS' "$WD"
}

@test "T003487-reg: watchdog.sh hat noch den INSERT INTO factory_control" {
  grep -q "INSERT INTO tickets.factory_control" "$WD"
}

@test "T003487-reg: watchdog.sh released noch slots" {
  grep -q "release-slot" "$WD"
}
