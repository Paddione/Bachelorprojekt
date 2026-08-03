# Partial p2 — Tests

## Scope

Failing-Test, der festschreibt, dass kein `.ticket`-loser Change ohne begruendeten
Vermerk verbleibt. Rot vor der Archivierung (p1), gruen nach p1.

## Task List

### 1. Bats-Test anlegen

- [ ] **1.1** `tests/spec/openspec-ticket-links-evaluation.bats` anlegen.
- [ ] **1.2** Test 1: Fuer jeden Change unter `openspec/changes/` (ausser `archive/`)
      existiert eine `.ticket`-Datei ODER der Change ist in `evaluation.md` als `offen`
      mit Begruendung vermerkt.
      `bats tests/spec/openspec-ticket-links-evaluation.bats` — expected: FAIL solange
      noch unarchivierte `.ticket`-lose Changes ohne Vermerk existieren.
- [ ] **1.3** Test 2: `evaluation.md` deckt alle 41 Changes aus der Ticket-Beschreibung
      ab (kein Change fehlt im Protokoll).
- [ ] **1.4** Test 3: `bash scripts/openspec.sh validate` liefert Exit 0 (kein Change
      ohne `specs/`-Delta).

## Verify

- `bats tests/spec/openspec-ticket-links-evaluation.bats` — Test 1 schlaegt vor der
  Archivierung fehl (erwartet FAIL), nach Abschluss von p1 ist er gruen.
