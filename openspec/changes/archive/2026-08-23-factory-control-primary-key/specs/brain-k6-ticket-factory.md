## ADDED Requirements

### Requirement: factory_control hat einen Primary Key und dedupliziert Globaleinträge

Die Tabelle `tickets.factory_control` SHALL einen Primary Key tragen. Die Eindeutigkeit von
`(key, brand)` SHALL auch für Zeilen mit `brand IS NULL` gelten (Postgres-`UNIQUE NULLS NOT
DISTINCT`), damit globale Steuerschlüssel nicht pro Tick dupliziert werden.

Das Global-Semantik-Muster (`brand NULL = global`) SHALL erhalten bleiben: `brand` bleibt
nullable, Reads mit `brand IS NULL` bleiben gültig.

#### Scenario: Doppel-Insert eines globalen Schlüssels

- **GIVEN** eine Zeile mit `key='last-tick-at'`, `brand IS NULL` existiert
- **WHEN** ein Writer `INSERT … ON CONFLICT (key, brand)` für denselben Schlüssel ausführt
- **THEN** wird die bestehende Zeile aktualisiert (Upsert greift)
- **AND** es entsteht keine zweite Zeile

#### Scenario: Migration auf Bestandstabelle

- **GIVEN** die Live-Tabelle enthält Duplikatzeilen für `(key, brand IS NULL)`
- **WHEN** `applyFactoryControlSchema` beim Start läuft
- **THEN** werden Duplikate kollabiert (neueste `updated_at` bleibt)
- **AND** Primary Key und NULLS-NOT-DISTINCT-Constraint sind vorhanden
- **AND** ein erneuter Lauf der Migration ist ein No-op (idempotent)
