#!/usr/bin/env bats
# tests/spec/ticket-system/update-fields-cli.bats
# T002714 — scripts/ticket.sh update-fields patches title/description.
# Test-Modus: command output verification (run/$output/$status), keine Source-Greps
# (T002448-M4) — außer dem einen Guard, der die MCP-Schema-Datei als Text prüfen
# MUSS, weil ihr Ergebnis sich nur im Quelltext manifestiert (Ausnahme laut
# CLAUDE.md "Test-Resultats-Konvention").

setup() {
  REPO="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "ticket.sh update-fields rejects missing --id" {
  run bash "$REPO/scripts/ticket.sh" update-fields --title "x"
  [ "$status" -eq 2 ]
}

@test "ticket.sh update-fields rejects call with no fields" {
  run bash "$REPO/scripts/ticket.sh" update-fields --id T000001
  [ "$status" -eq 2 ]
  echo "$output" | grep -qi "field\|Feld"
}

@test "ticket.sh update-fields offline skips write and exits 0" {
  run env TICKET_OFFLINE=1 bash "$REPO/scripts/ticket.sh" update-fields \
    --id T000001 --title "Neuer Titel"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "OFFLINE"
}

@test "ticket.sh update-fields is listed in the usage/help output" {
  run bash "$REPO/scripts/ticket.sh"
  [ "$status" -eq 1 ]
  echo "$output" | grep '^Commands:' | grep -q "update-fields"
}

@test "ticket-mcp update_fields tool schema declares title and description" {
  # Ausnahme von der Output-Verifikation (T002448-M4): das zu prüfende Ergebnis
  # ist die Schema-Deklaration selbst, ein reiner Quelltext-Fakt ohne Laufzeit-
  # Verhalten (der Go-MCP-Server läuft hier nicht) — Grep ist hier angemessen.
  run grep -n 'mcp.NewTool("update_fields"' -A 8 \
    "$REPO/scripts/ticket-mcp/go/internal/tools/lifecycle.go"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'WithString("title"'
  echo "$output" | grep -q 'WithString("description"'
}
