## Why

`task health:goals:update` aktualisiert die Prio-C-Tabelle in `.claude/lib/goals.md`, aber gibt
dem User keinen Überblick, welche Ziele nach dem Refresh ihr Target verfehlen (⚠) — inkl. der
neuen `G-AGENTIC03`–`G-AGENTIC17`-Ziele aus PR #2415. Ohne diese Übersicht muss die gesamte
Tabelle manuell durchgescrollt werden, um zu entscheiden, welche Verletzungen ein Ticket
verdienen.

## What Changes

- `scripts/health-goals-update.sh` druckt nach dem bestehenden Tabellen-Update-Report
  zusätzlich eine Liste aller Prio-C-Ziele mit Marker `⚠` (Target verfehlt), unabhängig davon,
  ob sich der Wert in diesem Lauf geändert hat.
- Pro offenem Ziel wird ein copy-paste-fähiger `scripts/ticket.sh create ...`-Befehlsvorschlag
  gedruckt (Titel, Beschreibung mit Aktuell/Target-Werten + Link auf `goals.md#<ID>`,
  `--priority mittel`).
- Kein automatisches Ticket-Anlegen, kein neues CLI-Flag — der Report läuft immer mit
  (auch bei `--dry-run`).

## Capabilities

### New Capabilities

(keine)

### Modified Capabilities

- `t001358-sec05-health-goals`: neue Requirement für den Offene-Ziele-Report von
  `health-goals-update.sh` (Anzeige + Ticket-Befehlsvorschlag für ⚠-Ziele).

## Impact

- `scripts/health-goals-update.sh` (Python-Heredoc-Block erweitert)
- `tests/spec/repo-health-goals.bats` (neu)
- Keine Änderung an `health-goals-check.sh`, `.claude/lib/goals.md`-Schreiblogik oder CI.
