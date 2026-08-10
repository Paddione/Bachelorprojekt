## ADDED Requirements

### Requirement: Hilfe auf Kommando- und Optionsebene

`scripts/ticket.sh` SHALL answer a help request at both levels: `help`, `--help` and `-h`
without a subcommand SHALL print the command list, and `--help`/`-h` after a subcommand SHALL
print that subcommand's option list with the mandatory flags visible. The help request SHALL be
handled before the subcommand's option-parsing loop, so it is never rejected as an unknown
option. This extends the existing hint from T002697 ("Aufruf ohne Argumente zeigt die erwarteten
Flags"), which covers only the case of a wrong argument, to the case of an explicit help request.
Subcommands implemented outside `scripts/ticket.sh` (`scripts/vda/ticket/*.sh`,
`scripts/lib/ticket-*.sh`) SHALL behave identically.

#### Scenario: Hilfe auf Kommandoebene

- **GIVEN** `scripts/ticket.sh help` bzw. `scripts/ticket.sh --help` wird aufgerufen
- **WHEN** das Skript das Argument auswertet
- **THEN** beendet es sich mit Exit-Code 0, gibt die Kommandoliste aus und meldet kein
  "Unknown command"

#### Scenario: Hilfe auf Optionsebene eines Subkommandos

- **GIVEN** `scripts/ticket.sh create --help` wird aufgerufen
- **WHEN** das Subkommando seine Argumente auswertet
- **THEN** beendet es sich mit Exit-Code 0 und nennt die Optionen des Subkommandos
  einschliesslich der Pflichtfelder `--type`, `--title` und `--description`; es meldet kein
  "Unknown create option"

#### Scenario: Kurzform -h und ausgelagerte Subkommandos

- **GIVEN** `scripts/ticket.sh update-status -h` (Subkommando in `scripts/ticket.sh`) bzw.
  `scripts/ticket.sh add-pr-link --help` (Subkommando in `scripts/lib/ticket-links.sh`)
- **WHEN** das jeweilige Subkommando seine Argumente auswertet
- **THEN** beendet es sich mit Exit-Code 0 und nennt seine Pflichtflags

#### Scenario: Unbekannte Option bleibt ein Fehler

- **GIVEN** `scripts/ticket.sh update-status --voellig-unbekannt` wird aufgerufen
- **WHEN** das Subkommando seine Argumente auswertet
- **THEN** beendet es sich mit einem Exit-Code ungleich 0 und meldet
  "Unknown update-status option" — der Hilfe-Vorabgriff entschaerft die Options-Schleife nicht
