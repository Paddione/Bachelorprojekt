## ADDED Requirements

### Requirement: plan-lint File-Structure-Kandidaten nur aus strukturellen Zeilen

`plan-lint.sh` SHALL Pfad-Tokens fuer die W3-Regel (File-Structure ↔ Tasks
Querpruefung) und fuer die B1a/B1b-Regeln (Budget-Integritaet) nur aus Zeilen
extrahieren, die wie eine Tabellenzeile (beginnt nach optionalem Leerraum mit `|`)
oder ein Listenpunkt (beginnt nach optionalem Leerraum mit `-` oder `*`) aussehen.
Eine freie Prosa-Zeile mit einem Backtick-Pfad SHALL keine Kandidaten liefern, auch
wenn sie innerhalb des `## File Structure`-Abschnitts steht.

#### Scenario: Ein echter Tabelleneintrag loest W3 weiterhin aus

- **GIVEN** ein Plan, dessen `## File Structure`-Abschnitt eine Tabellenzeile
  `| \`scripts/example.sh\` | ... |` enthaelt
- **AND** keine Task referenziert `scripts/example.sh`
- **WHEN** `plan-lint.sh` laeuft
- **THEN** meldet es eine W3-Warnung fuer `scripts/example.sh`

#### Scenario: Eine Prosa-Erwaehnung im File-Structure-Abschnitt loest keine W3-Warnung aus

- **GIVEN** ein Plan, dessen `## File Structure`-Abschnitt eine Tabellenzeile fuer
  Datei A und zusaetzlich einen Fliesstext-Satz enthaelt, der Datei B in Backticks
  als Beleg erwaehnt (kein Tabelleneintrag, kein Listenpunkt)
- **AND** keine Task referenziert Datei B
- **WHEN** `plan-lint.sh` laeuft
- **THEN** meldet es eine W3-Warnung fuer Datei A
- **AND** meldet KEINE W3-Warnung fuer Datei B

#### Scenario: Eine Prosa-Erwaehnung ausserhalb der Tabelle loest keine B1b-Warnung aus

- **GIVEN** ein Plan, der eine reale Datei mit Restbudget ≤ 0 nur in einem
  Fliesstext-Satz erwaehnt (nicht in einer Tabellenzeile oder einem Listenpunkt)
- **WHEN** `plan-lint.sh` laeuft
- **THEN** meldet es KEINE B1b-Warnung fuer diese Datei
