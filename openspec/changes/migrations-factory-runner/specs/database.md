## ADDED Requirements

### Requirement: Factory-DB-Migrationen laufen getrackt und automatisiert vor dem Deploy

Das System SHALL alle SQL-Dateien in `scripts/migrations/` über einen getrackten Runner
(`scripts/migrate-factory.mjs`, aufgerufen via `task factory:migrate ENV=<env>`) idempotent
und in lexikographischer Reihenfolge (Dateiname `YYYY-MM-DD-*`) gegen die Ziel-DB anwenden.
Der Anwendungsstand SHALL in einer eigenen Tabelle `public.factory_schema_migrations`
(getrennt von der website-eigenen `public.schema_migrations`) getrackt werden. Bereits
getrackte Migrationen SHALL nicht erneut ausgeführt werden. `task factory:migrate` SHALL an
denselben drei Stellen in `task workspace:deploy` verankert sein, an denen `task website:migrate`
läuft, sodass beide Migrationsströme bei jedem Deploy deterministisch angewendet werden.

#### Scenario: Neue Migrationsdatei liegt vor

- **GIVEN** `scripts/migrations/` enthält eine `.sql`-Datei, die noch nicht in
  `public.factory_schema_migrations` getrackt ist
- **WHEN** `task workspace:deploy ENV=<brand>` (bzw. direkt `task factory:migrate ENV=<brand>`) läuft
- **THEN** wird diese Datei in einer eigenen `pg.Client`-Transaktion (`BEGIN`/SQL/`INSERT`/`COMMIT`)
  ausgeführt und anschließend in `public.factory_schema_migrations` als applied getrackt

#### Scenario: Alle Migrationen bereits angewendet

- **GIVEN** jede Datei in `scripts/migrations/` ist bereits in `public.factory_schema_migrations` getrackt
- **WHEN** `task factory:migrate ENV=<brand>` läuft
- **THEN** wird keine Datei erneut ausgeführt und der Lauf endet ohne Fehler

#### Scenario: Getrennte Tracking-Tabelle

- **GIVEN** die website-Migrationen werden in `public.schema_migrations` getrackt
- **WHEN** der Factory-Runner gegen dieselbe DB läuft
- **THEN** trackt er ausschließlich in `public.factory_schema_migrations` und lässt
  `public.schema_migrations` unberührt

### Requirement: Factory-Migrations-Runner erkennt bereits real angewendete, aber ungetrackte Migrationen

Das System SHALL beim Ausführen einer Migrationsdatei, die einen "already exists"-Fehler
(Postgres SQLSTATE `42P07`, `42710` oder `42701`) auslöst, diese Datei als bereits angewendet in
`public.factory_schema_migrations` eintragen (`INSERT ... ON CONFLICT DO NOTHING`), statt den
Migrationslauf abzubrechen. Alle anderen Fehlerklassen SHALL den Lauf mit vollständiger
Fehlermeldung abbrechen, ohne die Datei zu tracken. Der gesamte Lauf SHALL auf einer einzigen
dedizierten `pg.Client`-Connection stattfinden, damit die Transaktionsgrenzen nicht über mehrere
Pool-Verbindungen verloren gehen.

#### Scenario: Erstlauf gegen eine DB mit manuell vorangewendeten DDL-Objekten

- **WHEN** der Runner erstmalig gegen eine DB läuft, in der `public.factory_schema_migrations` neu
  angelegt wird und eine Migrationsdatei ein `CREATE TABLE`/`CREATE INDEX`/`ADD COLUMN` für ein
  bereits existierendes Objekt enthält
- **THEN** wird die Datei mit SQLSTATE `42P07`/`42710`/`42701` abgefangen, als applied getrackt, und
  der Lauf setzt sich mit der nächsten Datei fort

#### Scenario: Echter SQL-Fehler in einer Migrationsdatei

- **WHEN** eine Migrationsdatei einen SQL-Fehler außerhalb der Allowlist (z. B. Syntaxfehler,
  fehlende Berechtigung) auslöst
- **THEN** bricht der Migrationslauf ab, die Datei wird NICHT getrackt, und der Deploy-Schritt
  schlägt mit der vollständigen Fehlermeldung fehl

#### Scenario: Einmaliger Ist-Zustand-geprüfter Backfill vor Aktivierung

- **GIVEN** die 17 zum Zeitpunkt der Konsolidierung bestehenden Dateien wurden bisher manuell via
  `factory_psql` angewendet, und mehrere davon sind reine Seed-/Data-Migrationen (`INSERT`), die
  keinen abfangbaren "already exists"-Fehler werfen
- **WHEN** der Operator den einmaligen Backfill-Runbook-Schritt für mentolder und korczewski
  ausführt, nachdem pro Brand-DB der Ist-Zustand (Existenz der Marker-Objekte aus den 17 Dateien)
  geprüft wurde
- **THEN** werden nur die tatsächlich bereits angewendeten Dateinamen in
  `public.factory_schema_migrations` vorbefüllt (`INSERT ... ON CONFLICT DO NOTHING`), sodass der
  erste produktive Runner-Lauf keine Seed-Migration doppelt ausführt
