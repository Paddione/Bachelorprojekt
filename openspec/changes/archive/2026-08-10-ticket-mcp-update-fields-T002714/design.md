---
ticket_id: T002714
plan_ref: openspec/changes/ticket-mcp-update-fields-T002714/tasks.md
status: active
date: 2026-08-09
---

# Design: ticket-mcp-update-fields-T002714

## Root-Cause

`mcp__ticket-mcp__update_fields` (`scripts/ticket-mcp/go/internal/tools/lifecycle.go:100-127`)
deklariert nur die `notes`-Property im JSON-Schema und ruft intern immer `add-comment` auf.
`title`/`description` fehlen im Schema, obwohl die Tool-Beschreibung sie nennt. Auf der Bash-Seite
(`scripts/ticket.sh`) gibt es dafür kein Äquivalent — nur `update-status` (Status/Resolution) und
`add-comment` (append-only). Ein Ticket-Titel ist damit nach der Anlage faktisch unveränderlich.

Symptom vs. Hypothese (T002448-M5): das Symptom ist "Tool-Beschreibung ≠ Schema" (belegt durch
Lesen der Tool-Definition und des Ticket.sh-Dispatchers, kein Reproducer nötig — es ist ein
statischer Code-Fakt). Die im Ticket genannte Ursache bei T002703 (falscher Titel nach
widerlegter Hypothese) ist der konkrete Schadensfall, der den drift sichtbar machte.

## Fix-Ansatz

Zwei Optionen standen zur Wahl (siehe `proposal.md` Abschnitt "Begründung"):

1. Beschreibung kürzen (Schema bleibt bei `notes`) — billig, behebt aber nicht das eigentliche
   Problem (Titel bleibt nach Triage fix).
2. **Gewählt:** Schema erweitern — `title`/`description` werden echte, patchbare Parameter.

Umsetzung:
- `scripts/vda/ticket/update-fields.sh` (neu, analog zu `update-status.sh`): `--id`, optional
  `--title`, `--description`. Mindestens eines von beiden ist Pflicht (Exit 2 sonst). Nutzt
  `_ticket_lock_guard`, `_pgpod`, `_exec_sql` aus `_ticket-core.sh` — gleiches Muster wie
  `update-status.sh`.
- `scripts/ticket.sh`: neue `cmd_update_fields()` (mit `_ticket_offline_skip` analog
  `cmd_update_status`), neuer `update-fields)`-Case-Zweig, Usage-Zeile ergänzt.
- `scripts/ticket-mcp/go/internal/tools/lifecycle.go`: `update_fields`-Tool bekommt
  `mcp.WithString("title", …)` und `mcp.WithString("description", …)` zusätzlich zu `notes`.
  Handler ruft bei gesetztem `title`/`description` `update-fields`, bei gesetztem `notes`
  weiterhin `add-comment` — beide Aufrufe sind unabhängig, laufen bei Bedarf nacheinander.

## Betroffene Subsysteme

- `scripts/ticket.sh` (Dispatcher, Usage-String)
- `scripts/vda/ticket/update-fields.sh` (neu)
- `scripts/ticket-mcp/go/internal/tools/lifecycle.go` (MCP-Schema + Handler)
- `tests/spec/ticket-system/` (neuer Test für das CLI-Kommando)
- `openspec/specs/ticket-system.md` (SSOT — Requirement ergänzt bei Archivierung)

## Edge-Cases

- Weder `--title` noch `--description` noch `--notes` gesetzt → Exit 2 (CLI) bzw. der bisherige
  Fallback-Text „Keine Felder zum Aktualisieren angegeben." (MCP-Handler, bleibt für den
  All-fields-empty-Fall erhalten).
- `TICKET_OFFLINE=1` → `update-fields` printet `OFFLINE: skipped …` und exit 0, keine DB-Reise
  (Konvention aus `update-status`/`set-parent`).
- Agent-Lock hält ein fremdes Ticket → `_ticket_lock_guard` verweigert mit Exit 7, wie bei
  `update-status`.
- Go-Adapter: `title`/`description` und `notes` gleichzeitig gesetzt → zwei sequentielle
  `RunTicket`-Aufrufe (update-fields, dann add-comment); schlägt der erste fehl, wird der zweite
  nicht versucht (Fehler wird durchgereicht wie bisher bei jedem Tool in dieser Datei).
- Leerer String vs. nicht gesetzt: ein leerer `--title ""` wird wie "nicht gesetzt" behandelt
  (gleiche Konvention wie `notes` im bestehenden Code), damit ein versehentlicher leerer Patch
  nicht den Titel löscht.
