## ADDED Requirements

### Requirement: Lesepfade unterscheiden kein-Treffer von falscher-Frage

Die Lesekommandos von `scripts/ticket.sh` SHALL eine ungültige Anfrage von einem leeren Ergebnis
unterscheiden. Eine leere Antwort mit Exit 0 SHALL ausschließlich bedeuten, dass die Anfrage
gültig war und keine Zeile traf.

`list` SHALL die Werte von `--status`, `--type` und `--attention-mode` gegen die jeweils
definierte Wertemenge prüfen und bei einem unbekannten Wert mit Exit 2 abbrechen. Die
Fehlermeldung SHALL den abgelehnten Wert und die gültigen Werte nennen. Eine Komma-Liste SHALL
als Ganzes abgelehnt werden, sobald ein Glied ungültig ist.

`get --id` SHALL bei einem nicht existierenden Ticket mit Exit 4 abbrechen und die gesuchte ID in
der Meldung nennen. Exit 4 SHALL von Exit 2 (Bedienfehler) und Exit 9 (Offline-Refusal)
unterschieden bleiben.

#### Scenario: Unbekannter Statuswert wird abgelehnt

- **GIVEN** `open` gehört nicht zu den 11 definierten Status
- **WHEN** `scripts/ticket.sh list --status open` läuft
- **THEN** ist der Exit-Code 2
- **AND** die Ausgabe ist nicht `[]`
- **AND** die Meldung nennt `open` sowie die gültigen Status

#### Scenario: Gültige Komma-Liste bleibt zulässig

- **GIVEN** `done` und `archived` sind definierte Status
- **WHEN** `scripts/ticket.sh list --status "done, archived"` läuft
- **THEN** wird die Liste nicht wegen ungültiger Werte abgelehnt

#### Scenario: Eine Liste mit ungültigem Glied wird ganz abgelehnt

- **WHEN** `scripts/ticket.sh list --status "done,bogusxyz"` läuft
- **THEN** ist der Exit-Code 2
- **AND** die Meldung nennt `bogusxyz`

#### Scenario: get auf ein nicht existierendes Ticket

- **GIVEN** `T999999` existiert nicht
- **WHEN** `scripts/ticket.sh get --id T999999` läuft
- **THEN** ist der Exit-Code 4
- **AND** die Meldung nennt `T999999`
- **AND** der Exit-Code ist weder 0 noch 2

### Requirement: Filter-Validierung läuft vor dem Datenbankzugriff

Die Validierung der Filterwerte SHALL vor dem Auflösen der Datenbankverbindung stattfinden. Ein
Bedienfehler SHALL auch dann als Exit 2 erkennbar sein, wenn keine Datenbank erreichbar ist.

Begründung: CI stellt keine Ticket-Datenbank bereit. Ein Guard hinter dem Verbindungsaufbau wäre
dort dauerhaft übersprungen statt wirksam und würde damit dieselbe Maskierung erzeugen, die als
T014384 erfasst ist.

#### Scenario: Bedienfehler wird ohne Datenbank erkannt

- **GIVEN** keine Ticket-Datenbank ist erreichbar
- **WHEN** `scripts/ticket.sh list --status bogusxyz` läuft
- **THEN** ist der Exit-Code 2
- **AND** die Meldung nennt `bogusxyz`
- **AND** die Meldung ist kein Verbindungsfehler
