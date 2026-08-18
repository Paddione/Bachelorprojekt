#!/usr/bin/env bats
# tests/spec/ticket-ops/triage-status-ssot.bats
# SSOT: openspec/specs/ticket-ops.md (vda.sh ticket triage)
# Fix: T008345
#
# Die Status-Validierung von `vda.sh ticket triage` liest ihr Vokabular aus der
# Website-SSO components/website/src/lib/tickets/statuses.json — dieselbe Datei,
# die lib/tickets/status.ts importiert (T007955). Der Hardcode in triage.sh ist
# weg; ein Drift zwischen Shell-Validierung und TicketStatus-Union ist damit
# strukturell ausgeschlossen.
#
# Pruefmodus (T002448-M4): Kommando-Ausfuehrung (Output-Verifikation) — die
# Status-Validierung laeuft VOR jedem DB-Zugriff, die Assertions haengen an
# Exit-Code und Fehlermeldung, nicht am Quelltext.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "triage: ungueltiger Status wird mit exit 2 und SSOT-Werten abgelehnt" {
  run bash "$REPO/scripts/vda.sh" ticket triage --id T000001 --status not_a_status
  [ "$status" -eq 2 ]
  [[ "$output" == *"Invalid status: not_a_status"* ]]
  # Die Fehlermeldung nennt die SSOT-Werte (aus statuses.json gebaut) —
  # Positiv-Anker, damit der Test bei fehlender Quelle nicht vakuos gruen ist.
  [[ "$output" == *"triage|planning|plan_staged"* ]]
  [[ "$output" == *"|done|archived"* ]]
}

@test "triage: Positiv-Anker — gueltiger Status passiert die Validierung" {
  # Kommt an der Validierung vorbei (exit != 2, keine Invalid-Meldung); der
  # spätere DB-Zugriff scheitert in der Testumgebung erwartungsgemäß (exit 3).
  run bash "$REPO/scripts/vda.sh" ticket triage --id T000001 --status planning
  [ "$status" -ne 2 ]
  [[ "$output" != *"Invalid status"* ]]
}
