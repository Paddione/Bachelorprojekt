## ADDED Requirements

### Requirement: Website-DB-Migrationen laufen automatisiert vor dem website-Rollout
Das System SHALL alle SQL-Dateien in `website/src/db/migrations/` vor dem Rollout der
website-Deployment automatisiert, idempotent und in chronologischer Reihenfolge (Dateiname
`YYYYMMDD_*`) gegen die Ziel-DB anwenden. Bereits angewendete Migrationen (getrackt in
`schema_migrations`) SHALL nicht erneut ausgeführt werden.

#### Scenario: Neue Migrationsdatei liegt vor
- **WHEN** `task workspace:deploy ENV=<brand>` läuft und `website/src/db/migrations/` eine Datei
  enthält, die noch nicht in `schema_migrations` getrackt ist
- **THEN** wird diese Datei vor dem Rollout der website-Deployment ausgeführt und anschließend in
  `schema_migrations` als applied getrackt

#### Scenario: Alle Migrationen bereits angewendet
- **WHEN** `task workspace:deploy ENV=<brand>` läuft und jede Datei in
  `website/src/db/migrations/` bereits in `schema_migrations` getrackt ist
- **THEN** wird keine der Dateien erneut ausgeführt und der Deploy fährt ohne Fehler fort

### Requirement: Migrations-Runner erkennt bereits real angewendete, aber ungetrackte Migrationen
Das System SHALL beim Ausführen einer Migrationsdatei, die einen "already exists"-Fehler
(Postgres SQLSTATE 42P07, 42710 oder 42701) auslöst, diese Datei als bereits angewendet in
`schema_migrations` eintragen, statt den Migrationslauf abzubrechen. Alle anderen Fehlerklassen
SHALL den Lauf mit vollständiger Fehlermeldung abbrechen.

#### Scenario: Erstlauf gegen eine DB mit manuell vorangewendeten Tabellen
- **WHEN** der Runner erstmalig gegen eine DB läuft, in der `schema_migrations` neu angelegt wird
  und eine Migrationsdatei ein `CREATE TABLE` für eine bereits existierende Tabelle enthält
- **THEN** wird die Datei mit SQLSTATE 42P07 abgefangen, als applied getrackt, und der Lauf setzt
  sich mit der nächsten Datei fort

#### Scenario: Echter SQL-Fehler in einer Migrationsdatei
- **WHEN** eine Migrationsdatei einen SQL-Fehler außerhalb der Allowlist (z. B. Syntaxfehler,
  fehlende Berechtigung) auslöst
- **THEN** bricht der Migrationslauf ab, die Datei wird NICHT als applied getrackt, und der
  Deploy-Schritt schlägt mit der vollständigen Fehlermeldung fehl
