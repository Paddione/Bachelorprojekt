## MODIFIED Requirements

### Requirement: Validate ist ein fail-closed CI-Gate für Delta-Dateien

The system SHALL jede aktive Delta-Spec-Datei in `openspec/changes/*/specs/*.md` auf drei
Kriterien prüfen: Vorhandensein eines `## ADDED|MODIFIED|REMOVED Requirements`-Headers,
mindestens ein `### Requirement:`-Eintrag (H3), und Abwesenheit von H2-`## Requirement:`-Headern,
und SHALL mit Exit-Code ungleich 0 fehlschlagen, sobald eine Datei ein Kriterium verletzt.
When `scripts/openspec.sh validate` mit genau einem Slug-Argument aufgerufen wird, SHALL der
Befehl ausschließlich das Change-Verzeichnis `openspec/changes/<slug>/` validieren; existiert
dieses Verzeichnis nicht, SHALL der Befehl mit Exit-Code ungleich 0 fehlschlagen und eine
Meldung ausgeben, die den übergebenen Slug nennt. Ohne Slug-Argument SHALL weiterhin der
Voll-Lauf über alle aktiven Changes erfolgen, und die Abschlusszeile SHALL kenntlich machen,
dass alle Changes geprüft wurden; bei einem gezielten Slug-Lauf SHALL die Abschlusszeile den
validierten Slug nennen. Der Präfix `openspec validate:` der Abschlusszeile SHALL stabil
bleiben. Mehr als ein Positionsargument an `validate` SHALL mit Usage-Fehler und Exit-Code
ungleich 0 abgewiesen werden.

#### Scenario: Wohlgeformter Change-Tree besteht Validation

- **GIVEN** alle Delta-Specs haben korrekte H2-Sektions-Header und H3-Requirement-Einträge
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** gibt der Befehl eine Zeile mit `openspec validate: OK` aus und beendet mit Exit-Code 0

#### Scenario: Falsche Heading-Ebene (H2 statt H3) schlägt fehl

- **GIVEN** eine Delta-Spec verwendet `## Requirement:` (H2) statt `### Requirement:` (H3)
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 fehl und benennt die fehlerhafte Datei

#### Scenario: Fehlender Operations-Header schlägt fehl

- **GIVEN** eine Delta-Spec enthält keinen `## ADDED|MODIFIED|REMOVED Requirements`-Header
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 fehl

#### Scenario: Archivierte Changes werden nicht validiert

- **GIVEN** ein Change unter `openspec/changes/archive/` hat eine fehlerhafte Delta-Spec
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** wird der archivierte Change übersprungen und der Befehl beendet mit Exit-Code 0

#### Scenario: Slug-Argument validiert gezielt nur diesen Change

- **GIVEN** ein wohlgeformter Change `good` und ein regelverletzender Change `broken`
  existieren unter `openspec/changes/`
- **WHEN** `bash scripts/openspec.sh validate good` ausgeführt wird
- **THEN** beendet der Befehl mit Exit-Code 0, obwohl `broken` regelverletzend ist
- **AND** die Abschlusszeile nennt den Slug `good`, nicht `broken`

#### Scenario: Unbekanntes Slug-Argument schlägt fail-closed fehl

- **GIVEN** kein Change-Verzeichnis `does-not-exist` existiert unter `openspec/changes/`
- **WHEN** `bash scripts/openspec.sh validate does-not-exist` ausgeführt wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 fehl und benennt den unbekannten Slug

#### Scenario: Voll-Lauf ohne Argument ist kenntlich gemacht

- **GIVEN** alle aktiven Changes sind wohlgeformt
- **WHEN** `bash scripts/openspec.sh validate` ohne Argument ausgeführt wird
- **THEN** gibt der Befehl eine Abschlusszeile aus, die den Voll-Lauf kenntlich macht
  (`all changes`), und beendet mit Exit-Code 0

#### Scenario: Mehr als ein Positionsargument wird abgewiesen

- **GIVEN** beliebige Changes unter `openspec/changes/`
- **WHEN** `bash scripts/openspec.sh validate slug-a slug-b` ausgeführt wird
- **THEN** weist der Befehl den Aufruf mit Usage-Hinweis und Exit-Code ungleich 0 ab,
  ohne einen Change zu prüfen
