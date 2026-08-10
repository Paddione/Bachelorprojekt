## ADDED Requirements

### Requirement: propose --help gibt Hilfe aus, statt in die Argument-Guards zu laufen

The system SHALL print a usage message listing the options of the `propose` verb
and exit with status 0 when `--help` is passed to `scripts/openspec.sh propose`,
without evaluating the `<slug>` or `--ticket` guards, without creating a change
directory and without performing any ticket status transition.

#### Scenario: propose --help liefert Usage statt Ticket-Guard-Fehler

- **GIVEN** `scripts/openspec.sh` ist vorhanden
- **WHEN** `bash scripts/openspec.sh propose --help` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe enthält eine Usage-Angabe
- **AND** die Ausgabe enthält die Optionsnamen `--ticket`, `--target-spec` und `--resume`
- **AND** die Ausgabe enthält NICHT den Guard-Text `requires --ticket`

#### Scenario: propose --help legt kein Change-Verzeichnis an

- **GIVEN** ein leeres `OPENSPEC_ROOT` mit vorhandenem `changes/`-Verzeichnis
- **WHEN** `bash scripts/openspec.sh propose --help` mit diesem `OPENSPEC_ROOT` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** `changes/` enthält danach keinen einzigen Eintrag

#### Scenario: Die Argument-Guards bleiben für echte Aufrufe scharf

- **GIVEN** `scripts/openspec.sh` ist vorhanden
- **WHEN** `bash scripts/openspec.sh propose <slug>` ohne `--ticket` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe enthält `requires --ticket`
- **AND** es wird kein Change-Verzeichnis für `<slug>` angelegt
