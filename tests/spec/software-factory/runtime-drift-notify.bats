#!/usr/bin/env bats
# [T014940] Runtime-Drift-Guard sichtbar machen:
#   - runtime-drift-check.sh --notify <external_id> meldet Befunde als
#     Ticket-Kommentar (ticket.sh add-comment), statt nur in Cron-Logs zu
#     verschwinden.
#   - repo-hygiene-cron.sh ruft den Detektor täglich mit --auto-kill und
#     --notify auf dem Hygiene-Tracking-Ticket auf und führt die Befundzahl
#     als runtime_drift.findings in seinen JSON-Metriken.
# Hintergrund: am 2026-08-23 hielt eine Session ticket-mcp-go auf dem alten
# Inode nach einem Rebuild — der Detektor (T003825) existierte, war aber nur
# manuell sichtbar. Der Operator will DEUTLICH gewarnt werden.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/../../../scripts/runtime-drift-check.sh"
  CRON="${BATS_TEST_DIRNAME}/../../../scripts/repo-hygiene-cron.sh"
}

@test "runtime-drift-check: unbekanntes Argument wird abgewiesen (exit 2)" {
  run bash "$SCRIPT" --bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"Unbekanntes Argument"* ]]
}

@test "runtime-drift-check: --notify ohne Ticket-ID wird abgewiesen (exit 2)" {
  run bash "$SCRIPT" --notify
  [ "$status" -eq 2 ]
  [[ "$output" == *"braucht eine Ticket-external_id"* ]]
}

@test "runtime-drift-check: --notify sendet Befund via ticket.sh add-comment" {
  grep -q 'notify_ticket' "$SCRIPT"
  grep -q 'scripts/ticket.sh" add-comment' "$SCRIPT"
  grep -q -- '--id "$NOTIFY_TICKET"' "$SCRIPT"
  grep -q -- '--author "runtime-drift-guard"' "$SCRIPT"
}

@test "runtime-drift-check: Notify sammelt Befundzeilen aus DRIFT_LINES" {
  grep -q 'DRIFT_LINES+=(' "$SCRIPT"
  grep -q 'findings="$(printf' "$SCRIPT"
}

@test "runtime-drift-check: fehlgeschlagener Ticket-Kommentar bricht den Lauf nicht" {
  # DB-down darf den Detektor nicht killen — Warnung auf stderr, weiter.
  grep -q 'WARNUNG — Ticket-Kommentar.*fehlgeschlagen' "$SCRIPT"
}

@test "repo-hygiene-cron: Daily-Lauf ruft Drift-Guard mit auto-kill und notify" {
  grep -q -- '--auto-kill --notify "$HYGIENE_TRACKING_TICKET"' "$CRON"
}

@test "repo-hygiene-cron: Drift-Befundzahl landet als runtime_drift im JSON" {
  grep -q 'runtime_drift_findings' "$CRON"
  grep -q 'runtime_drift: { findings: \$runtime_drift_findings }' "$CRON"
}
