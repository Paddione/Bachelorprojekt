# quickwins-script-fixes

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu quickwins-script-fixes ergänzen._

## Requirements

### Requirement: touched_files enthält real geänderte Dateien

The system SHALL plan-touched-files so betreiben, dass `touched_files` die tatsächlich im Change geänderten Dateien (Diff gegen Branch-Basis) enthält, vereinigt mit den im Plan erwähnten Pfaden.

#### Scenario: Datei geändert, aber nicht erwähnt

- **GIVEN** ein Plan erwähnt Pfad A, der Change ändert aber auch Pfad B
- **WHEN** `touched_files` ermittelt wird
- **THEN** enthält es sowohl A als auch B

### Requirement: preflight-pr-scope-Test deterministisch

The system SHALL den preflight-pr-scope-Test so stabilisieren, dass er nicht von den im PR real geänderten Pfaden abhängt (Fixture-basiert, Output-Verifikation).

#### Scenario: CI ohne scripts-Änderung

- **GIVEN** ein PR ohne scripts/-Änderung
- **WHEN** der preflight-pr-scope-Test in CI läuft
- **THEN** ist er grün (deterministisch, nicht diff-abhängig)

### Requirement: Backup-Restore-Check erkennt beschädigte Downloads

The system SHALL den Restore-Check so betreiben, dass ein beschädigter kubectl-Attach-Download erkannt wird (Größe/Checksumme/Format) und nicht als "Restore ok" durchgeht.

#### Scenario: Beschädigter Download

- **GIVEN** der kubectl-Attach-Download liefert eine beschädigte Datei
- **WHEN** der Restore-Check läuft
- **THEN** schlägt er mit klarer Fehlermeldung fehl

#### Scenario: Intaktes Backup

- **GIVEN** ein intaktes Backup
- **WHEN** der Restore-Check läuft
- **THEN** besteht er (Positiv-Anker, kein vakues Bestehen)

<!-- merged from change delta quickwins-script-fixes.md (2ba63aaab760) -->