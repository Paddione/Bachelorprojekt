## ADDED Requirements

### Requirement: refresh ohne Argumente wird sauber abgelehnt

`agent-lock.sh refresh` SHALL bei fehlendem Scope-Argument (oder einem
flag-artigen ersten Argument) eine verständliche Ablehnung mit Scope/id-
Aufrufform auf stderr ausgeben und mit Exit-Code 2 enden — niemals einen
`set -u`-unbound-variable-Crash erzeugen.

#### Scenario: refresh ganz ohne Argumente

- **GIVEN** das Skript läuft unter `set -u`
- **WHEN** `bash scripts/agent-lock.sh refresh` ohne weitere Argumente
  aufgerufen wird
- **THEN** enthält die stderr-Ausgabe den Hinweis „refresh" und die
  positionale Aufrufform `<scope> <id>`
- **AND** der Exit-Code ist 2
- **AND** es wurde keine Lock-Datei angelegt oder verändert.

#### Scenario: refresh mit flag-artigem Erstargument

- **GIVEN** das Skript läuft unter `set -u`
- **WHEN** `bash scripts/agent-lock.sh refresh --ticket T000123`
  aufgerufen wird
- **THEN** wird das Argument als unbekannter Scope abgelehnt (Exit-Code 2)
  statt es als Lock-Namen zu verwenden [T002692-Muster].
