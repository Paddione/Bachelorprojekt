# database

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Beschreibt den Integrationsvertrag der PostgreSQL-Datenbankschicht: eine einzelne
`pgvector/pgvector:0.8.0-pg16`-Instanz (`shared-db`) mit logisch getrennten Datenbanken
pro Service, die im Kubernetes-Namespace `workspace` (bzw. `workspace-korczewski`)
betrieben wird.

---

## Requirements

### Requirement: Service Isolation via Separate Databases

The system SHALL provide a dedicated PostgreSQL database and role per service (keycloak,
nextcloud, vaultwarden, website, videovault) so that no service can read or write another
service's data through normal DB connections.

#### Scenario: Service connects to own database only

- **GIVEN** the shared-db pod is running
- **WHEN** a service authenticates with its own role credentials (e.g. `website`/`WEBSITE_DB_PASSWORD`)
- **THEN** it is connected to its own database (`website`) and has no access to `keycloak`, `nextcloud`, or `vaultwarden` databases

#### Scenario: Idempotent initialization on re-deploy

- **GIVEN** shared-db is restarted or re-deployed on an existing cluster
- **WHEN** the `postStart` lifecycle hook runs
- **THEN** it creates missing roles and databases without failing on already-existing ones, and syncs all role passwords from current Kubernetes Secrets

---

### Requirement: Self-Healing Schema on Pod Restart

The system SHALL re-apply all role provisioning and database creation on every pod startup
via the `postStart` lifecycle hook, so that partial initdb failures (missing databases
after role creation) self-heal on the next pod restart without manual intervention.

#### Scenario: Partial initdb failure recovery

- **GIVEN** a fresh cluster where `docker-entrypoint-initdb.d` ran but failed after role creation before database creation
- **WHEN** the shared-db pod restarts
- **THEN** the `postStart` hook creates the missing databases and the website application connects successfully on the next request

#### Scenario: Schema ensure scripts run each startup

- **GIVEN** shared-db starts
- **WHEN** `postStart` completes
- **THEN** `ensure-knowledge-schema.sh`, `ensure-meetings-schema.sh`, and `ensure-bachelorprojekt-schema.sh` have been invoked (errors are tolerated via `|| true` to not block startup)

---

### Requirement: TLS Encryption for All Connections

The system SHALL enable TLS on the PostgreSQL server using a self-signed certificate
generated at each pod startup, so that all client connections benefit from in-transit
encryption within the cluster network.

#### Scenario: Server starts with TLS enabled

- **GIVEN** the `generate-tls-cert` initContainer ran successfully
- **WHEN** the postgres process starts
- **THEN** it is launched with `ssl=on`, `ssl_cert_file`, and `ssl_key_file` flags pointing to the emptyDir-mounted certificate

#### Scenario: Certificate regenerated on restart

- **GIVEN** the shared-db pod is restarted
- **WHEN** the initContainer completes
- **THEN** a fresh self-signed certificate is generated with CN `shared-db.workspace.svc.cluster.local` valid for 825 days, replacing the previous one

---

### Requirement: Lazy-Once Schema Initialization per Process

The website application SHALL initialize each schema exactly once per process lifetime
via the `ensureSchemaOnce` memoization pattern, so that concurrent requests do not race
on DDL statements and cause `tuple concurrently updated` errors on the PostgreSQL system
catalog.

#### Scenario: Concurrent first requests share one init promise

- **GIVEN** the website pod just started and `initTicketsSchema` has not been called yet
- **WHEN** multiple concurrent requests arrive that each try to call `initTicketsSchema`
- **THEN** only one DDL transaction is issued against PostgreSQL; all callers await the same cached promise

#### Scenario: Failed init is retried on next request

- **GIVEN** `initTicketsSchema` was called but the database was not yet ready (connection refused)
- **WHEN** the promise is rejected
- **THEN** the entry is removed from `_schemaInitOnce` so the next request can retry initialization

---

### Requirement: Eager Boot-Time Schema Migration

The website application SHALL trigger `initTicketsSchema` as a fire-and-forget at module
load time so that the `tickets` schema migrations apply during pod rollout rather than on
the first user request.

#### Scenario: Schema ready before first user hit

- **GIVEN** the website pod is starting up
- **WHEN** `website-db.ts` is imported
- **THEN** `initTicketsSchema()` is called immediately; if the DB is ready, the schema is prepared before any request is served; if not, it is retried on the first access

---

### Requirement: pgvector Extension for Semantic Search

The system SHALL provide the pgvector extension (`pgvector/pgvector:0.8.0-pg16`) so that
the knowledge base can store document chunk embeddings and perform cosine-similarity
(`<=>`) nearest-neighbour queries within the database.

#### Scenario: Knowledge chunk indexed and queried

- **GIVEN** a document chunk with an embedding vector is stored in `knowledge.chunks`
- **WHEN** the knowledge API receives a semantic search query
- **THEN** the database returns ranked results ordered by `embedding <=> $queryVector` (cosine distance), without leaving the PostgreSQL connection

#### Scenario: Mixed embedding model rejected

- **GIVEN** two collections that used different embedding models (e.g. `bge-m3` and `voyage-multilingual-2`)
- **WHEN** a query spans both collections in a single call
- **THEN** the application raises `MixedEmbeddingModelError` and does NOT issue the cross-space query to PostgreSQL

---

### Requirement: Encrypted Daily Backup with Integrity Verification

The system SHALL run a Kubernetes CronJob daily at 02:00 UTC that dumps all service
databases with `pg_dump -Fc`, encrypts each dump with AES-256-CBC (PBKDF2) using
`BACKUP_PASSPHRASE` from Kubernetes Secrets, verifies dump integrity before encrypting,
and uploads the encrypted archives to Filen cloud storage.

#### Scenario: Successful nightly backup run

- **GIVEN** shared-db is reachable and `BACKUP_PASSPHRASE` is set
- **WHEN** the `db-backup` CronJob runs
- **THEN** four encrypted `.dump.enc` files (keycloak, nextcloud, vaultwarden, website) are uploaded to Filen; plaintext dumps are deleted from disk before upload

#### Scenario: Corrupt or empty dump aborts backup

- **GIVEN** `pg_dump` produces output smaller than 200 bytes or missing the `PGDMP` magic header
- **WHEN** the backup script validates the dump file
- **THEN** the job exits with a non-zero code and no encrypted file is created for that database, marking the CronJob run as Failed

---

### Requirement: Per-Brand Database Isolation in Fleet Cluster

The system SHALL provide separate `shared-db` instances per brand namespace
(`workspace` for mentolder, `workspace-korczewski` for korczewski) so that each brand's
application data is contained within its own namespace and cross-namespace DB access is
not possible from normal pod networking.

#### Scenario: Korczewski website writes to korczewski namespace DB

- **GIVEN** the korczewski website pod runs in `workspace-korczewski`
- **WHEN** it resolves `shared-db.workspace-korczewski.svc.cluster.local`
- **THEN** it connects to the korczewski-local shared-db, not to the mentolder `workspace` shared-db (which would be ECONNREFUSED across namespaces)

#### Scenario: Backup-read grants cover all schemas

- **GIVEN** `pg_dump -U website -d website` is invoked during backup
- **WHEN** multiple schemas (`arena`, `audit`, `platform`, `knowledge`, `tickets`) exist in the website database owned by different roles
- **THEN** the `website` role has been granted `SELECT` on all tables in all listed schemas via `GRANT SELECT ON ALL TABLES IN SCHEMA`, and the dump completes without `permission denied` errors

---

### Requirement: Knowledge Ingest Bug-Ticket Query Uses Correct Columns

The system SHALL ensure that `ingest-bug-tickets.mjs` queries the `ticket_id` column (not the non-existent `id` or `title` columns) when selecting from the tickets schema, so that the ingest job does not fail with a missing-column error.

#### Scenario: Falscher Spaltenname wird abgelehnt

- **GIVEN** die Kustomize-Manifeste werden gerendert
- **WHEN** das gerenderte YAML auf `SELECT id, title` geprüft wird
- **THEN** ist dieser Query-String NICHT im Manifest vorhanden, da `id` und `title` in der Tickets-Tabelle nicht existieren

#### Scenario: Korrekter Spaltenname ist vorhanden

- **GIVEN** die Kustomize-Manifeste werden gerendert
- **WHEN** das gerenderte YAML auf `ticket_id,` geprüft wird
- **THEN** ist `ticket_id` als Spaltenname im SELECT-Query vorhanden

---

### Requirement: Knowledge Ingest npm Install Uses Writable /tmp Prefix

The system SHALL configure `knowledge-ingest` init containers to install npm dependencies with `--prefix /tmp` and then copy them to the target directory, so that the installation does not fail on the read-only `/scripts` mount.

#### Scenario: Readonly-Mount wird nicht als Install-Ziel verwendet

- **GIVEN** die Kustomize-Manifeste werden gerendert
- **WHEN** das gerenderte YAML auf einen direkten `cd /scripts && npm install` Befehl geprüft wird
- **THEN** ist dieser Befehl NICHT im Manifest vorhanden

#### Scenario: /tmp-Prefix und anschließendes Kopieren sind vorhanden

- **GIVEN** die Kustomize-Manifeste werden gerendert
- **WHEN** das gerenderte YAML auf npm-install-Befehle geprüft wird
- **THEN** enthält es `--prefix /tmp` sowie `cp -r /tmp/node_modules/*` zum Übertragen der Module in das Zielverzeichnis

---

### Requirement: Knowledge Ingest PR-Query Selects Only Existing Columns

The system SHALL ensure that `ingest-prs.mjs` does not reference the non-existent `body` or `labels` columns in its `SELECT pr_number` query, so that the PR ingest job does not fail with a column-not-found error.

#### Scenario: Nicht-existente Spalten fehlen im SELECT

- **GIVEN** die Kustomize-Manifeste werden gerendert
- **WHEN** der Bereich um `SELECT pr_number` im gerenderten YAML analysiert wird
- **THEN** enthalten die nachfolgenden Zeilen WEDER `body,` noch `labels` als Spaltennamen

---

### Requirement: Shared-DB postStart Self-Heals Roles and Databases

The system SHALL check for the existence of each service role and database before creating them in the `postStart` lifecycle hook using conditional `CREATE USER` and `CREATE DATABASE` guards, so that every service role and database is idempotently provisioned on each pod start.

#### Scenario: Fehlende Datenbanken werden beim Neustart angelegt

- **GIVEN** `shared-db.yaml` enthält den `postStart` Hook
- **WHEN** der Hook prüft, ob Datenbanken existieren
- **THEN** enthält das Manifest eine Schleife über alle Services (`keycloak nextcloud vaultwarden website pentest videovault`) mit `CREATE DATABASE` und einer vorgelagerten `SELECT 1 FROM pg_database WHERE datname='$db'`-Prüfung

#### Scenario: Rollen werden mit NOT-EXISTS-Guard angelegt

- **GIVEN** `shared-db.yaml` enthält den `postStart` Hook
- **WHEN** der Hook Rollen anlegt
- **THEN** enthält das Manifest für jeden Service-Role (`keycloak`, `nextcloud`, `vaultwarden`, `website`, `pentest`) eine Existenzprüfung via `rolname='<role>'` vor dem `CREATE USER`-Befehl

---

### Requirement: Architecture Graph JSON Contains Valid Structure

The system SHALL maintain a `docs/generated/graph.json` that contains at least 10 nodes and 1 edge, and uses `WEBSITE_NAMESPACE` and `WORKSPACE_NAMESPACE` as placeholder strings, so that the admin architecture view renders a complete and namespace-agnostic graph.

#### Scenario: Namespace-Platzhalter sind vorhanden

- **GIVEN** `docs/generated/graph.json` existiert
- **WHEN** die Datei auf Namespace-Platzhalter geprüft wird
- **THEN** enthält sie mindestens ein Vorkommen von `WEBSITE_NAMESPACE` und mindestens ein Vorkommen von `WORKSPACE_NAMESPACE`

#### Scenario: Graph enthält ausreichend Knoten und Kanten

- **GIVEN** `docs/generated/graph.json` existiert und ist valides JSON
- **WHEN** die `nodes`- und `edges`-Arrays ausgewertet werden
- **THEN** hat `nodes` mindestens 10 Einträge und `edges` mindestens 1 Eintrag

---

### Requirement: Bugs-to-Tickets Migration Supports Safe Dry-Run and Transactional Apply

The system SHALL provide `scripts/migrate-bugs-to-tickets.mjs` with a default dry-run mode that makes no database writes, and an `--apply` flag that wraps all changes in a `BEGIN`/`COMMIT`/`ROLLBACK` transaction, so that operators can preview migration results before committing.

#### Scenario: Dry-Run verändert keine Daten

- **GIVEN** die Website-Datenbank enthält `bugs.bug_tickets`-Einträge
- **WHEN** das Migrationsskript ohne `--apply` ausgeführt wird
- **THEN** bleibt die Anzahl der Zeilen in `tickets.tickets WHERE type='bug'` unverändert, und die JSON-Ausgabe enthält `"mode":"dry-run"`

#### Scenario: Apply-Modus verwendet Transaktion

- **GIVEN** das Migrationsskript enthält den `--apply`-Pfad
- **WHEN** der Quelltext auf Transaktionssteuerung geprüft wird
- **THEN** enthält er `BEGIN`, `COMMIT` und `ROLLBACK`-Anweisungen zur atomaren Ausführung

---

### Requirement: Bugs-to-Tickets Migration Maps Status and Category Correctly

The system SHALL map `bugs.bug_tickets` status values to `tickets.tickets` status/resolution values (`open`→`triage`, `resolved`→`done`+`fixed`, `archived`→`archived`+`fixed`) and category values to `kind:*` tags (`fehler`→`kind:bug`, `verbesserung`→`kind:improvement`, `erweiterungswunsch`→`kind:wish`), so that all legacy bug data is faithfully represented in the new ticket schema.

#### Scenario: Statuswerte werden korrekt gemappt

- **GIVEN** `bugs.bug_tickets` enthält Zeilen mit Status `open`, `resolved` und `archived`
- **WHEN** die Migration mit `--apply` ausgeführt wird
- **THEN** entspricht die Anzahl der `triage`-Tickets der Anzahl der `open`-Bugs, die Anzahl der `done`+`fixed`-Tickets der Anzahl der `resolved`-Bugs, und `archived`+`fixed` der Anzahl der `archived`-Bugs

#### Scenario: Kategorie-Tags werden korrekt erstellt

- **GIVEN** `bugs.bug_tickets` enthält Zeilen mit `category='fehler'`
- **WHEN** die Migration mit `--apply` ausgeführt wird
- **THEN** hat jedes migrierte Bug-Ticket das Tag `kind:bug` in `tickets.ticket_tags`

---

### Requirement: Bugs-to-Tickets Migration Is Idempotent and Preserves Extensions

The system SHALL run `migrate-bugs-to-tickets.mjs --apply` multiple times without duplicating rows (deduplication via `external_id` check), migrate `bug_ticket_comments` as `ticket_comments`, `screenshots_json` as `ticket_attachments`, and `fixed_in_pr` as `ticket_links` with `kind='fixes'`, and replace the `bugs.bug_tickets` table with a compatibility view after migration.

#### Scenario: Wiederholter Apply erzeugt keine Duplikate

- **GIVEN** die Migration wurde bereits erfolgreich mit `--apply` ausgeführt
- **WHEN** das Skript ein zweites Mal mit `--apply` ausgeführt wird
- **THEN** enthält die JSON-Ausgabe `"skipped"` gleich der Gesamtzahl der `bugs.bug_tickets`-Zeilen, und die Anzahl der Bug-Tickets in `tickets.tickets` bleibt unverändert

#### Scenario: bugs.bug_tickets wird nach Migration zur View

- **GIVEN** die Migration wird mit `--apply` ausgeführt
- **WHEN** `pg_class.relkind` für `bugs.bug_tickets` abgefragt wird
- **THEN** ist der Wert `'v'` (View), und Queries wie `WHERE fixed_in_pr = ANY(...)` funktionieren weiterhin über die View

---

### Requirement: Tickets Status CHECK Constraint Includes plan_staged Idempotently

The system SHALL include `plan_staged` between `planning` and `backlog` in the `tickets_status_check` constraint, and the migration that adds this value SHALL use `DROP CONSTRAINT IF EXISTS` before re-adding it, so that the migration can be re-applied without error.

#### Scenario: plan_staged ist im CHECK-Constraint vorhanden

- **GIVEN** `website/src/lib/tickets-db.ts` definiert den Status-CHECK
- **WHEN** der Quelltext auf den plan_staged-Wert geprüft wird
- **THEN** enthält der CHECK-Constraint die Sequenz `'planning','plan_staged','backlog'` in dieser Reihenfolge

#### Scenario: Migrations-Statement ist idempotent

- **GIVEN** der CHECK-Constraint wurde bereits in einer früheren Migration angelegt
- **WHEN** `tickets-db.ts` eine neue Migration zum Hinzufügen von `plan_staged` enthält
- **THEN** beginnt die Migration mit `DROP CONSTRAINT IF EXISTS tickets_status_check`, bevor der neue Constraint angelegt wird

---

### Requirement: Tracking-to-Tickets Migration Preserves v_timeline Column Shape

The system SHALL ensure that `bachelorprojekt.v_timeline` retains all required columns (`id`, `day`, `merged_at`, `pr_number`, `title`, `description`, `category`, `scope`, `brand`, `requirement_id`, `requirement_name`) after the tracking migration, so that the Kore homepage timeline section continues to render historical data correctly.

#### Scenario: Alle Pflichtspalten sind in v_timeline vorhanden

- **GIVEN** die Datenbank enthält das Schema `bachelorprojekt` mit der View `v_timeline`
- **WHEN** `information_schema.columns` für `bachelorprojekt.v_timeline` abgefragt wird
- **THEN** sind alle Pflichtspalten (`id`, `day`, `merged_at`, `pr_number`, `title`, `description`, `category`, `scope`, `brand`, `requirement_id`, `requirement_name`) vorhanden

#### Scenario: Dry-Run schreibt keine Daten

- **GIVEN** `TRACKING_DB_URL` zeigt auf eine Nicht-Produktionsdatenbank
- **WHEN** `migrate-tracking-to-tickets.mjs` ohne `--apply` ausgeführt wird
- **THEN** bleibt die Anzahl der Zeilen in `tickets.pr_events` unverändert

---

### Requirement: Tracking-to-Tickets Migration Creates ticket_links for Requirement Associations

The system SHALL create a `ticket_links` row with `kind='fixes'` and the associated `pr_number` for every feature row in `bachelorprojekt.features` that has a `requirement_id`, and the migration SHALL be idempotent on repeated `--apply` runs.

#### Scenario: ticket_links wird für verknüpfte Feature-Zeilen erstellt

- **GIVEN** `bachelorprojekt.features` enthält eine Zeile mit gesetztem `requirement_id` und zugehöriger `pr_number`
- **WHEN** `migrate-tracking-to-tickets.mjs --apply` ausgeführt wird
- **THEN** existiert in `tickets.ticket_links` eine Zeile mit `kind='fixes'` und der entsprechenden `pr_number`, verknüpft mit dem Ticket des Requirements

#### Scenario: Wiederholter Apply erzeugt keine Duplikate

- **GIVEN** `migrate-tracking-to-tickets.mjs --apply` wurde bereits einmal ausgeführt
- **WHEN** das Skript ein zweites Mal mit `--apply` ausgeführt wird
- **THEN** enthält `tickets.tickets WHERE external_id=<test-id>` genau einen Eintrag (kein Duplikat)

---

### Requirement: Projects-to-Tickets Migration Preserves Hierarchy and Back-Compat View

The system SHALL migrate `projects`, `sub_projects`, and `project_tasks` into `tickets.tickets` with correct `parent_id` chains (sub_project parent is a top-level project; task parent is a project or sub_project), and SHALL expose a back-compat `public.projects` view with all original columns and reverse-mapped status values (`in_progress`→`aktiv`).

#### Scenario: parent_id-Hierarchie ist korrekt

- **GIVEN** die Migration wurde mit `--apply` ausgeführt
- **WHEN** `tickets.tickets` auf Waisenkinder geprüft wird
- **THEN** hat jedes `type='project'` mit gesetztem `parent_id` ein gültiges übergeordnetes Ticket vom `type='project'` ohne eigenes `parent_id`, und jedes `type='task'` mit gesetztem `parent_id` hat ein gültiges übergeordnetes `type='project'`-Ticket

#### Scenario: Back-Compat-View hat alle Pflichtspalten und korrektes Status-Mapping

- **GIVEN** `public.projects` ist eine View nach abgeschlossener Migration
- **WHEN** `information_schema.columns` für die View abgefragt wird und eine Zeile mit `status='in_progress'` über die View gelesen wird
- **THEN** sind alle Pflichtspalten (`id`, `brand`, `name`, `description`, `notes`, `start_date`, `due_date`, `status`, `priority`, `customer_id`, `admin_id`, `created_at`, `updated_at`) vorhanden, und der Status erscheint als `aktiv`

---

### Requirement: QA DAL Approve Transition Sets done Status and done_at Timestamp

The system SHALL update a ticket's `status` to `done` and set `done_at` to a non-null timestamp when `createQaReview` is called with `verdict='approved'` and all QA criteria passing.

#### Scenario: Approve setzt Status und Zeitstempel

- **GIVEN** ein Ticket mit `status='qa_review'` existiert in `tickets.tickets`
- **WHEN** `createQaReview` mit `verdict='approved'` und allen Kriterien `passed:true` aufgerufen wird
- **THEN** ist `status='done'` und `done_at IS NOT NULL` in der Datenbank gesetzt

---

### Requirement: QA DAL Reject Transition Returns Ticket to In-Progress with Factory Injection

The system SHALL update a ticket's `status` to `in_progress` and create exactly one `ticket_injections` row with `kind='note'` when `createQaReview` is called with `verdict='rejected'`, so that the Software Factory re-entry point is recorded in the database.

#### Scenario: Reject setzt Status zurück und legt Injection an

- **GIVEN** ein Ticket mit `status='qa_review'` existiert in `tickets.tickets`
- **WHEN** `createQaReview` mit `verdict='rejected'`, einem fehlgeschlagenen Kriterium und `re_entry_phase='implement'` aufgerufen wird
- **THEN** ist `status='in_progress'` in `tickets.tickets` gesetzt, und in `tickets.ticket_injections` existiert genau eine Zeile mit `ticket_id=<id>` und `kind='note'`

---

### Requirement: System Test Seed Data Exports Exactly 13 Templates

The system SHALL export exactly 13 `SYSTEM_TEST_TEMPLATES` from `system-test-seed-data.ts`, each representing one test category, so that the system test runner loads a deterministic and complete set of test scenarios.

#### Scenario: Korrekte Anzahl Templates vorhanden

- **GIVEN** `SYSTEM_TEST_TEMPLATES` wird aus `system-test-seed-data.ts` importiert
- **WHEN** die Länge des Arrays geprüft wird
- **THEN** beträgt sie genau 13

#### Scenario: Gesamtanzahl Steps ist 206

- **GIVEN** alle 13 Templates sind geladen
- **WHEN** die Steps aller Templates aufsummiert werden
- **THEN** ergibt die Summe genau 206

---

### Requirement: System Test Templates Have Correct Per-Category Step Counts

The system SHALL provide templates whose step counts exactly match the specification `[6, 10, 5, 5, 5, 12, 16, 14, 5, 10, 7, 8, 103]` in the defined order, so that test coverage of each category is precisely controlled and auditable.

#### Scenario: Step-Counts entsprechen der Spezifikation

- **GIVEN** alle 13 Templates sind in der festgelegten Reihenfolge geladen
- **WHEN** die Anzahl der Steps jedes Templates gemessen wird
- **THEN** entspricht die resultierende Liste exakt `[6, 10, 5, 5, 5, 12, 16, 14, 5, 10, 7, 8, 103]`

#### Scenario: Kein Template hat null oder leere Step-Liste

- **GIVEN** alle 13 Templates sind geladen
- **WHEN** jedes Template auf seine `steps`-Eigenschaft geprüft wird
- **THEN** hat kein Template eine leere oder fehlende `steps`-Liste

---

### Requirement: System Test Templates Have Non-Empty Metadata Fields

The system SHALL ensure every template has non-empty `title`, `description`, and `instructions` fields, so that test runners and human reviewers can identify the purpose and execution context of each test category.

#### Scenario: Alle Metadatenfelder sind befüllt

- **GIVEN** alle 13 Templates sind geladen
- **WHEN** `title`, `description` und `instructions` jedes Templates auf Länge geprüft werden
- **THEN** hat jedes Feld eine Länge größer als 0

---

### Requirement: System Test Steps Have Non-Empty Question and Expected Result

The system SHALL ensure every step in every template has non-empty `question_text` and `expected_result` fields, so that each test step contains a testable assertion with a clear instruction.

#### Scenario: Alle Steps haben Frage und Erwartung

- **GIVEN** alle Steps aus allen 13 Templates werden iteriert
- **WHEN** `question_text` und `expected_result` auf Inhalt geprüft werden
- **THEN** hat jedes Feld in jedem Step eine Länge größer als 0

#### Scenario: Keine Step-Felder sind undefined oder null

- **GIVEN** ein beliebiger Step aus einem beliebigen Template
- **WHEN** `question_text` und `expected_result` ausgelesen werden
- **THEN** sind beide Werte vom Typ `string` und nicht leer

---

### Requirement: System Test Steps Have Valid Role Assignment

The system SHALL restrict `test_role` on every step to exactly `'admin'` or `'user'`, so that the test runner can select the correct session context when executing each step.

#### Scenario: Nur erlaubte Rollen sind vergeben

- **GIVEN** alle Steps aus allen 13 Templates werden iteriert
- **WHEN** das Feld `test_role` jedes Steps geprüft wird
- **THEN** ist der Wert entweder `'admin'` oder `'user'` — kein anderer Wert ist zulässig

---

### Requirement: System Test Step URLs Are Relative or Absolute HTTPS

The system SHALL ensure every step's `test_function_url` is either a relative path starting with `/` or an absolute URL starting with `https://`, so that the test runner can safely construct navigation targets without ambiguous or insecure URLs.

#### Scenario: Alle Step-URLs haben gültiges Format

- **GIVEN** alle Steps aus allen 13 Templates werden iteriert
- **WHEN** `test_function_url` jedes Steps auf das URL-Format geprüft wird
- **THEN** beginnt jede URL entweder mit `/` (relativer Pfad) oder mit `https://` (absolutes HTTPS)

#### Scenario: Ungültige URL-Formate sind nicht vorhanden

- **GIVEN** alle Steps aus allen 13 Templates werden iteriert
- **WHEN** `test_function_url` auf `http://` (ohne TLS) oder leere Strings geprüft wird
- **THEN** enthält kein Step eine solche URL

---

### Requirement: System Test Templates Cover All Bookkeeping Requirements A-01 to C-13

The system SHALL ensure that the combined text of all step `question_text`, `expected_result`, and `req_ids` fields references every requirement ID in the sets A-01..A-15, B-01..B-11, and C-01..C-13, so that no bookkeeping requirement is left without test coverage.

#### Scenario: Alle Requirement-IDs sind abgedeckt

- **GIVEN** alle Steps aus allen 13 Templates werden konkateniert (question_text + expected_result + req_ids)
- **WHEN** der kombinierte Text auf jede ID aus A-01..A-15, B-01..B-11 und C-01..C-13 geprüft wird
- **THEN** kommt jede ID mindestens einmal im kombinierten Text vor; die Liste fehlender IDs ist leer

#### Scenario: Fehlende Coverage-IDs werden als Fehler gemeldet

- **GIVEN** eine Requirement-ID fehlt in allen Step-Texten
- **WHEN** der Test ausgeführt wird
- **THEN** schlägt der Test mit einer Fehlermeldung fehl, die die fehlenden IDs explizit nennt

---

### Requirement: resolveDomain Falls Back to localhost When PROD_DOMAIN Is Unset or Empty

The system SHALL return `'localhost'` from `resolveDomain()` when `process.env.PROD_DOMAIN` is undefined or an empty string, so that local development and test runs resolve to a safe default without requiring environment configuration.

#### Scenario: PROD_DOMAIN nicht gesetzt ergibt localhost

- **GIVEN** `process.env.PROD_DOMAIN` ist nicht gesetzt (undefined)
- **WHEN** `resolveDomain()` aufgerufen wird
- **THEN** gibt die Funktion `'localhost'` zurück

#### Scenario: Leerer PROD_DOMAIN-Wert ergibt localhost

- **GIVEN** `process.env.PROD_DOMAIN` ist auf den leeren String `''` gesetzt
- **WHEN** `resolveDomain()` aufgerufen wird
- **THEN** gibt die Funktion `'localhost'` zurück und nicht den leeren String

---

### Requirement: ticket_plans Content Column Never Selected Without Row Filter

The system SHALL never issue `SELECT *` or explicitly select the `content` column on the
`tickets.ticket_plans` table without a `WHERE` clause that filters to a specific
`ticket_id` or `slug`, because the `content` column stores large plan Markdown files
whose bulk transfer over a `kubectl exec` connection causes connection timeouts.

#### Scenario: Unbeschränkte Content-Abfrage löst Timeout aus

- **GIVEN** die Tabelle `tickets.ticket_plans` enthält mehrere Zeilen mit großen `content`-Werten (mehrere Megabytes gesamt)
- **WHEN** eine Abfrage wie `SELECT * FROM tickets.ticket_plans` oder `SELECT content FROM tickets.ticket_plans` ohne WHERE-Klausel über eine `kubectl exec psql`-Verbindung ausgeführt wird
- **THEN** schlägt die Verbindung mit einem Timeout fehl, bevor alle Daten übertragen sind, und liefert kein verwertbares Ergebnis

#### Scenario: Gefilterte Abfrage auf einzelnes Ticket liefert Inhalt ohne Timeout

- **GIVEN** die Tabelle `tickets.ticket_plans` enthält Zeilen mit großen `content`-Werten
- **WHEN** eine Abfrage mit `WHERE ticket_id = $1` oder `WHERE slug = $1` auf eine einzelne Zeile abgesetzt wird
- **THEN** wird nur der Inhalt einer einzigen Zeile übertragen, die Abfrage schließt innerhalb der Verbindungs-Timeout-Grenze ab, und der Inhalt ist vollständig lesbar

---

### Requirement: ticket_plans Metadata Queries Exclude the Content Column

The system SHALL query only metadata columns (`id`, `ticket_id`, `slug`, `branch`,
`pr_number`, `archived_at`) when listing or searching `tickets.ticket_plans` entries,
so that bulk listing operations never transfer large Markdown payloads and do not risk
connection timeouts regardless of table size.

#### Scenario: Listing-Abfrage enthält keine content-Spalte

- **GIVEN** ein Agent oder Skript listet alle Plan-Einträge für ein Ticket auf
- **WHEN** die SQL-Abfrage gegen `tickets.ticket_plans` ohne spezifische Zeilen-Filterung abgesetzt wird
- **THEN** enthält die SELECT-Liste ausschließlich Metadaten-Spalten (`id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) — die Spalte `content` ist nicht enthalten

#### Scenario: Archivstatus-Prüfung benötigt kein content

- **GIVEN** ein Prozess prüft, ob ein Plan bereits archiviert wurde
- **WHEN** `SELECT archived_at FROM tickets.ticket_plans WHERE ticket_id = $1` ausgeführt wird
- **THEN** wird lediglich der Timestamp übertragen; die `content`-Spalte wird nicht gelesen, und die Abfrage schließt in unter einer Sekunde ab

---

### Requirement: Cross-Brand Schema Migrations Apply to Both Fleet Namespaces

The system SHALL apply schema migrations that affect shared infrastructure (DB password
rotation, OIDC client changes, `tickets` schema changes) explicitly to both the
`workspace` namespace (mentolder) and the `workspace-korczewski` namespace (korczewski),
because both brands run separate `shared-db` instances in a single fleet cluster and
changes to one namespace are not visible in the other.

#### Scenario: Passwort-Rotation wird in beiden Namespaces durchgeführt

- **GIVEN** der fleet-Cluster betreibt `shared-db` sowohl in `workspace` als auch in `workspace-korczewski`
- **WHEN** eine DB-Passwort-Rotation durchgeführt wird
- **THEN** wird das neue Passwort in beiden Namespaces als SealedSecret neu verschlüsselt (`task env:seal ENV=mentolder` und `task env:seal ENV=korczewski`), und beide `shared-db`-Pods werden mit aktualisierten Credentials neu gestartet

#### Scenario: Schema-Migration gilt für beide Namespaces

- **GIVEN** eine Schemaänderung an `tickets.tickets` (z. B. neuer Status-Wert im CHECK-Constraint) wird entwickelt
- **WHEN** die Migration nach dem Merge auf `main` angewendet wird
- **THEN** wird das Migrationsskript gegen beide Datenbankinstanzen ausgeführt (`workspace/shared-db` und `workspace-korczewski/shared-db`), sodass beide Brands dasselbe Schema aufweisen

---

### Requirement: Cluster Reset Follows Mandatory Six-Step Bring-Up Order

The system SHALL apply the six-step cluster initialization sequence (sealed-secrets
install → fetch-cert → env:seal → cert:install → cert:secret → workspace:deploy) in
strict order after any cluster reset or Sealed Secrets keypair rotation, because applying
SealedSecrets before the controller exists or deploying before cert-manager CRDs are
present will silently fail or leave the cluster without valid credentials.

#### Scenario: SealedSecrets werden vor dem Controller-Neustart abgelehnt

- **GIVEN** der Sealed Secrets Controller wurde neu installiert (neues Keypair)
- **WHEN** `task workspace:deploy` ausgeführt wird, bevor `task env:fetch-cert` und `task env:seal` abgeschlossen sind
- **THEN** verweigert der Controller die Entschlüsselung der alten SealedSecret-Dateien, Pods starten ohne Credentials, und die Deployment-Logs zeigen Fehler der Art `no key could decrypt secret`

#### Scenario: Vollständige Bring-Up-Sequenz stellt funktionierende Credentials sicher

- **GIVEN** ein Cluster-Reset wurde durchgeführt (neuer Sealed Secrets Controller)
- **WHEN** die sechs Schritte in der vorgeschriebenen Reihenfolge ausgeführt werden: `sealed-secrets:install` → `env:fetch-cert` → `env:seal` → `cert:install` → `cert:secret` → `workspace:deploy`
- **THEN** entschlüsselt der Controller alle SealedSecrets korrekt, cert-manager ist bereit vor dem ersten Ingress-Reconcile, und alle Pods starten mit gültigen Datenbankpasswörtern und TLS-Zertifikaten

---

### Requirement: MCP Postgres Preferred Over kubectl exec for Read-Only Queries

The system SHALL use `mcp__mcp-postgres__query` (port-forward via `localhost:13001`) for
all read-only SELECT queries against `tickets.*`, `knowledge.*`, and `v_timeline` when the
MCP portforward is reachable, and SHALL fall back to `kubectl exec … psql` only when the
MCP server is unavailable, because `kubectl exec` connections have limited bandwidth and
will time out when transferring large result sets (such as unfiltered `ticket_plans` rows).

#### Scenario: MCP-Portforward ist erreichbar — MCP-Tool wird verwendet

- **GIVEN** `bash scripts/mcp-portforward.sh status` meldet den Portforward als aktiv (HTTP 200 auf `localhost:13001`)
- **WHEN** ein Agent oder Skript eine read-only SELECT-Abfrage gegen `tickets.*` oder `knowledge.*` ausführen möchte
- **THEN** wird `mcp__mcp-postgres__query` mit dem SQL-Parameter verwendet; kein `kubectl exec psql`-Aufruf wird für diese Abfrage abgesetzt

#### Scenario: kubectl exec als Fallback bei nicht erreichbarem MCP

- **GIVEN** der MCP-Portforward ist nicht aktiv (HTTP-Statuscode ungleich 200 auf `localhost:13001`)
- **WHEN** ein Agent eine read-only Abfrage benötigt
- **THEN** wird die Abfrage über `kubectl exec -i <pod> -- psql -U website -d website` abgesetzt, und die Abfrage ist so formuliert, dass keine großen Datenmengen (insbesondere keine `content`-Spalte ohne WHERE-Filter) übertragen werden

---

### Requirement: env:generate Must Precede env:seal to Prevent Placeholder Credentials in SealedSecrets

The system SHALL run `task env:generate ENV=<target>` before `task env:seal ENV=<target>` whenever secrets are initialized or rotated, because sealing before generation produces SealedSecrets that contain the placeholder string `MANAGED_EXTERNALLY`, which causes all dependent services (including `shared-db` and Talk-HPB) to start with invalid credentials and fail their database connections.

#### Scenario: Fehlende env:generate führt zu ungültigen DB-Credentials

- **GIVEN** ein frischer Cluster oder eine Secrets-Rotation wird vorbereitet, und `env:generate` wurde noch nicht ausgeführt
- **WHEN** `task env:seal ENV=<target>` ausgeführt wird
- **THEN** enthält das resultierende `environments/sealed-secrets/<env>.yaml` den Platzhalter `MANAGED_EXTERNALLY` für signaling/turn-Secrets, und `talk-hpb-setup.sh` bricht beim Deploy mit einer Fehlermeldung über ungültige Credentials ab

#### Scenario: Korrekte Reihenfolge erzeugt valide Credentials

- **GIVEN** ein frischer Cluster wird aufgesetzt
- **WHEN** `task env:generate ENV=<target>` ausgeführt wird, bevor `task env:seal ENV=<target>` aufgerufen wird
- **THEN** enthält das SealedSecret keine `MANAGED_EXTERNALLY`-Platzhalter, alle generierten Passwörter sind verschlüsselt, und `shared-db`-Pods starten mit gültigen Datenbankpasswörtern

---

### Requirement: knowledge-secrets Plain Secret Deleted Before Re-Apply When Conflicting with SealedSecret

The system SHALL delete the plain `knowledge-secrets` Kubernetes Secret before re-applying
the kustomize overlay whenever a `secretGenerator`-managed Secret with the same name exists
alongside the SealedSecret, because the Sealed Secrets controller refuses to adopt a Secret
that was created by `secretGenerator` rather than by itself, leaving the knowledge service
without valid credentials.

#### Scenario: Konflikt zwischen secretGenerator-Secret und SealedSecret blockiert Adoption

- **GIVEN** das kustomize-Overlay enthält einen `secretGenerator`-Eintrag für `knowledge-secrets` und eine SealedSecret-Ressource mit demselben Namen
- **WHEN** `task workspace:deploy` ausgeführt wird, ohne das bestehende plain Secret zu löschen
- **THEN** verweigert der Sealed Secrets Controller die Adoption des Secrets, die Deployment-Logs zeigen einen Fehler der Art `secret already exists and is not owned by sealed-secrets-controller`, und der Knowledge-Service startet ohne Credentials

#### Scenario: Löschen des plain Secret ermöglicht korrekte SealedSecret-Adoption

- **GIVEN** ein `knowledge-secrets`-Secret existiert im Namespace, das nicht vom Sealed Secrets Controller verwaltet wird
- **WHEN** `kubectl delete secret knowledge-secrets -n $WORKSPACE_NS` ausgeführt wird und danach `task workspace:deploy` aufgerufen wird
- **THEN** erstellt der Controller ein neues, von ihm verwaltetes Secret aus dem SealedSecret, der Knowledge-Service startet mit gültigen Credentials, und `kubectl get secret knowledge-secrets -n $WORKSPACE_NS -o jsonpath='{.metadata.annotations}'` enthält die Controller-Annotation

---

### Requirement: Legacy coaching.ki_config Tables Dropped After Provider-Config Phase 2

Nach Abschluss der Datenmigration von `coaching.ki_config` in den vereinheitlichten Store
`tickets.provider_config` (`source='coaching'`) SHALL das System die Legacy-Tabellen
`coaching.ki_config` und `coaching.ki_config_id_map` in einer getaggten, idempotenten und
transaktionalen Migration löschen, aber erst nachdem eine Vorbedingungsprüfung bestätigt
hat, dass die Datenmigration vollständig ist. Die Spalte `coaching.sessions.ki_config_id`
und ihr Fremdschlüssel `sessions_ki_config_id_fkey` (der auf `tickets.provider_config`
zeigt) SHALL dabei unverändert bleiben, weil laufende Coaching-Sessions weiterhin über diese
Spalte auf ihre aktive Provider-Konfiguration verweisen.

#### Scenario: Drop-Migration entfernt beide Legacy-Tabellen

- **GIVEN** die Daten aus `coaching.ki_config` sind vollständig nach `tickets.provider_config` (`source='coaching'`) migriert und kein Laufzeit-Code liest oder schreibt die Legacy-Tabellen
- **WHEN** die Migration `scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql` gegen eine Brand-DB ausgeführt wird
- **THEN** existieren `coaching.ki_config` und `coaching.ki_config_id_map` danach nicht mehr (`to_regclass(...) IS NULL`), während `coaching.sessions.ki_config_id` und der FK `sessions_ki_config_id_fkey` unverändert vorhanden sind

#### Scenario: Vorbedingungs-Guard bricht ab, wenn die Migration nicht abgeschlossen ist

- **GIVEN** der FK `sessions_ki_config_id_fkey` zeigt nicht auf `tickets.provider_config` ODER mindestens eine `coaching.sessions.ki_config_id` verweist auf eine id, die nicht in `tickets.provider_config` existiert
- **WHEN** die Drop-Migration ausgeführt wird
- **THEN** bricht die Transaktion mit `RAISE EXCEPTION` ab, bevor irgendein `DROP TABLE` ausgeführt wird, und beide Legacy-Tabellen bleiben erhalten

#### Scenario: Migration ist idempotent und wird auf beide Brand-Namespaces angewendet

- **GIVEN** der fleet-Cluster betreibt `shared-db` in `workspace` (mentolder) und `workspace-korczewski` (korczewski)
- **WHEN** die Drop-Migration nach dem Merge gegen beide Brand-DBs ausgeführt und danach erneut ausgeführt wird
- **THEN** ist beide Male der Endzustand identisch (Tabellen fehlen), ohne Fehler beim zweiten Lauf (`DROP TABLE IF EXISTS`), und beide Brands weisen dasselbe Schema auf

### Requirement: Orphaned category Migration Removed

Das System SHALL keine verwaiste, nie angewendete Migration im Repository behalten. Die
Datei `scripts/migration/005-add-category-to-tickets.sql` (im Singular-Verzeichnis
`scripts/migration/`) SHALL gelöscht werden, weil die Spalte `tickets.tickets.category`
nicht in der Datenbank existiert, das zugehörige Feature nie live ging und kein
Laufzeit-Code die Spalte referenziert.

#### Scenario: Verwaiste Migrationsdatei ist entfernt

- **GIVEN** `scripts/migration/005-add-category-to-tickets.sql` wurde nie angewendet und `tickets.tickets.category` existiert in keiner Brand-DB
- **WHEN** das Repository nach der Bereinigung geprüft wird
- **THEN** existiert die Datei nicht mehr und keine `.ts`/`.js`-Laufzeitdatei referenziert eine `tickets.category`-Spalte

#### Scenario: Applied-Status wird cross-brand verifiziert

- **GIVEN** die `scripts/migrations/*.sql` werden manuell und ungetrackt pro Brand-DB angewendet
- **WHEN** der Applied-Status vor dem Cleanup geprüft wird
- **THEN** wird jede Migration explizit gegen beide Brand-DBs (`workspace` und `workspace-korczewski`) auf Existenz ihres Zielobjekts abgefragt und das Ergebnis dokumentiert, sodass Lücken zwischen den Brands sichtbar werden

### Requirement: Website DB Access Uses Shared Hardened Pool

Website-Module, die dieselbe `website`-Datenbank mit derselben Konfiguration wie der
kanonische Pool ansprechen, SHALL den gehärteten geteilten Pool aus
`website/src/lib/db-pool.ts` verwenden (mit `nodeLookup`-DNS-Workaround und fail-soft
Connection-/Statement-Timeouts), statt einen eigenen `new Pool(...)` zu erzeugen. Module,
die bewusst eine andere Datenbank, andere Umgebungsvariable oder abweichende
Timeout-Anforderungen haben (z. B. Bulk-Import ohne engen `statement_timeout`), SHALL als
dokumentierter Sonder-Pool bestehen bleiben und dürfen NICHT naiv zusammengelegt werden.

#### Scenario: Gleiche DB/Config wird auf den geteilten Pool umgestellt

- **GIVEN** ein Modul erzeugt einen eigenen `pg.Pool` über `SESSIONS_DATABASE_URL` mit derselben Ziel-DB wie `website/src/lib/db-pool.ts`
- **WHEN** die Pool-Konsolidierung angewendet wird
- **THEN** importiert das Modul `pool` aus `db-pool.ts`, erzeugt keinen eigenen Pool mehr und profitiert von DNS-Workaround und fail-soft Timeouts

#### Scenario: Abweichende DB/Config bleibt als dokumentierter Sonder-Pool

- **GIVEN** ein Modul nutzt eine andere Umgebungsvariable (z. B. `DATABASE_URL` statt `SESSIONS_DATABASE_URL`) oder benötigt einen längeren `statement_timeout` (Bulk-Import)
- **WHEN** die Pool-Konsolidierung geprüft wird
- **THEN** wird das Modul nicht auf den geteilten Pool umgestellt, und die Begründung (abweichende DB oder abweichende Timeout-Anforderung) wird in der DB-Audit-Notiz festgehalten

### Requirement: Index and Query Audit Is EXPLAIN-Driven and Non-Destructive

Optimierungsentscheidungen an der Datenbank SHALL evidenzbasiert getroffen werden. Ein Index
SHALL nur hinzugefügt werden, wenn `EXPLAIN (ANALYZE, BUFFERS)` auf der real ausgeführten
Query einen messbaren Gewinn zeigt; auf Kleintabellen (wenige hundert Zeilen) SHALL kein
Index mechanisch hinzugefügt werden, weil Postgres dort korrekt Seq-Scan wählt. Ungenutzte
Indizes (`idx_scan=0`) SHALL nur als Empfehlungsliste erfasst und NICHT blind gedroppt
werden, weil die Statistik-Momentaufnahme aus nur einer DB stammt; ein Drop erfolgt erst nach
Gegencheck der Prod-Statistik beider Brands.

#### Scenario: Kein Index auf Kleintabelle ohne EXPLAIN-Beleg

- **GIVEN** eine Tabelle mit nur wenigen hundert Zeilen zeigt in `pg_stat` einen Seq-Scan
- **WHEN** ein Index in Erwägung gezogen wird
- **THEN** wird `EXPLAIN (ANALYZE, BUFFERS)` auf die reale Query gefahren, und ein Index wird nur angelegt, wenn der Plan messbar günstiger wird; andernfalls wird die Nicht-Änderung mit dem EXPLAIN-Auszug begründet

#### Scenario: Ungenutzte Indizes werden nur empfohlen, nicht gedroppt

- **GIVEN** mehrere Indizes zeigen `idx_scan=0` in einer einzelnen DB-Momentaufnahme
- **WHEN** das Index-Audit durchgeführt wird
- **THEN** entsteht eine Empfehlungsliste in der DB-Audit-Notiz, und es wird in dieser Änderung kein `DROP INDEX` ausgeführt

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Bugs-to-Tickets Migration Truncates Titles and Carries resolution_note Comments
<!-- bats: tickets-migration.bats -->

The system SHALL truncate the legacy bug description to 200 characters as the new ticket title, and SHALL migrate `resolution_note` fields as `ticket_comments` rows with `kind='status_change'` and `author_label='migration'`, so that historical resolution context is preserved without title overflow.

#### Scenario: Titel wird auf 200 Zeichen begrenzt *(BATS)*

- **GIVEN** `scripts/migrate-bugs-to-tickets.mjs` ist die Migrationsquelle
- **WHEN** der Quelltext auf die Beschneidungslogik geprüft wird
- **THEN** enthält er `slice(0, 200)` als Implementierung der Titellängenbegrenzung

#### Scenario: resolution_note wird als status_change-Kommentar migriert *(BATS)*

- **GIVEN** `bugs.bug_tickets`-Zeilen enthalten ein nicht-leeres `resolution_note`-Feld
- **WHEN** `migrate-bugs-to-tickets.mjs --apply` ausgeführt wird
- **THEN** enthält der Quelltext `'migration'` als `author_label` und `'status_change'` als `kind` für den erzeugten Kommentar; zur Laufzeit entspricht `count(*) FROM tickets.ticket_comments WHERE kind='status_change' AND author_label='migration'` der Anzahl der Zeilen mit `resolution_note`

---

### Requirement: Bugs-to-Tickets Migration Carries Full Extension Data
<!-- bats: tickets-migration.bats -->

The system SHALL migrate `bug_ticket_comments` to `ticket_comments`, `screenshots_json` to `ticket_attachments`, and `fixed_in_pr` to `ticket_links` with `kind='fixes'`, and SHALL create a compatibility view in place of the original `bugs.bug_tickets` table after migration.

#### Scenario: Erweiterungsdaten sind im Migrationsskript referenziert *(BATS)*

- **GIVEN** `scripts/migrate-bugs-to-tickets.mjs` existiert
- **WHEN** der Quelltext auf Extension-Blöcke geprüft wird
- **THEN** enthält er Referenzen auf `bug_ticket_comments`, `screenshots_json`, `ticket_attachments`, `ticket_links` und `kind='fixes'`

#### Scenario: View-Erstellung ist durch !dryRun geschützt *(BATS)*

- **GIVEN** der Migrationsmodus ist auf dry-run gesetzt (kein `--apply`)
- **WHEN** der Quelltext auf die View-Erstellung geprüft wird
- **THEN** enthält er `CREATE OR REPLACE VIEW bugs.bug_tickets`, `pg_tables` und `bug_tickets_legacy` als Absicherung gegen unbeabsichtigte View-Erstellung im Dry-Run

#### Scenario: fixed_in_pr-Zeilen erzeugen ticket_links *(BATS)*

- **GIVEN** `bugs.bug_tickets` enthält Zeilen mit nicht-null `fixed_in_pr`
- **WHEN** `migrate-bugs-to-tickets.mjs --apply` ausgeführt wird
- **THEN** ist die Anzahl der `ticket_links WHERE kind='fixes' AND pr_number IS NOT NULL` gleich der Anzahl der `bugs.bug_tickets WHERE fixed_in_pr IS NOT NULL`

#### Scenario: Legacy-JOIN auf fixed_in_pr funktioniert über die View *(BATS)*

- **GIVEN** `bugs.bug_tickets` ist nach der Migration eine View
- **WHEN** eine Abfrage `WHERE fixed_in_pr = ANY('{...}'::int[])` gegen die View abgesetzt wird
- **THEN** schlägt die Abfrage nicht fehl und gibt ein auswertbares Ergebnis zurück

---

### Requirement: Projects-to-Tickets Migration Dry-Run Writes No Data
<!-- bats: tickets-projects-migration.bats -->

The system SHALL leave `tickets.tickets` unchanged when `migrate-projects-to-tickets.mjs` is invoked without `--apply`, so that operators can preview row counts before committing.

#### Scenario: Dry-Run erhöht die Ticket-Anzahl nicht *(BATS)*

- **GIVEN** `tickets.tickets` enthält eine bekannte Anzahl von `type IN ('project','task')`-Zeilen
- **WHEN** `migrate-projects-to-tickets.mjs` ohne `--apply` ausgeführt wird
- **THEN** ist die Anzahl der Zeilen nach dem Lauf identisch mit der Anzahl vorher

#### Scenario: Zeilenanzahl-Parität zwischen Legacy-Tabellen und Tickets *(BATS)*

- **GIVEN** die Legacy-Tabellen `projects`, `sub_projects`, `project_tasks` (oder ihre `_legacy`-Pendants) existieren
- **WHEN** `migrate-projects-to-tickets.mjs --apply` ausgeführt wird
- **THEN** ist die Anzahl der Ticket-Zeilen mit `type='project' AND parent_id IS NULL` mindestens so hoch wie die Zahl der Top-Level-Projekte, und analog für Subprojekte und Tasks

---

### Requirement: Architecture Graph API and UI Assets Exist
<!-- bats: T000668-graph-api.bats -->

The system SHALL provide a `graph.ts` API endpoint, an `architektur.astro` page, an `ArchitekturGraph.svelte` component, and an `AdminLayout` sidebar entry so that the admin architecture view is fully navigable and renders the architecture graph.

#### Scenario: API-Endpunkt-Datei existiert *(BATS)*

- **GIVEN** das Website-Repository ist ausgecheckt
- **WHEN** der Pfad `website/src/pages/api/admin/cluster/graph.ts` geprüft wird
- **THEN** existiert die Datei

#### Scenario: Astro-Seite und Svelte-Komponente existieren *(BATS)*

- **GIVEN** das Website-Repository ist ausgecheckt
- **WHEN** die Pfade `website/src/pages/admin/architektur.astro` und `website/src/components/admin/ArchitekturGraph.svelte` geprüft werden
- **THEN** existieren beide Dateien

#### Scenario: AdminLayout enthält Architektur-Sidebar-Eintrag *(BATS)*

- **GIVEN** `website/src/layouts/AdminLayout.astro` ist die Admin-Navigation
- **WHEN** die Datei auf `/admin/architektur` geprüft wird
- **THEN** enthält sie einen Link zu `/admin/architektur` als Sidebar-Eintrag

---

### Requirement: Admin Client CRUD Lifecycle Persists Through Keycloak and Website DB
<!-- e2e: fa-admin-db-crud-clients.spec.ts -->

The system SHALL allow an authenticated admin to create a Keycloak-backed client, view it in the client list, navigate to its detail page, add and delete client notes, and finally delete the client, with all changes reflected in both Keycloak and the website database.

#### Scenario: Client erstellen, Detail aufrufen, Notiz anlegen und löschen, Client löschen *(E2E)*

- **GIVEN** ein Admin-Benutzer ist über Keycloak SSO am Admin-Bereich angemeldet
- **WHEN** ein neuer Client per `POST /api/admin/clients/create` mit E-Mail, Vorname und Nachname erstellt wird, danach die Client-Liste aufgerufen wird, der Client-Detail-Tab für Notizen navigiert wird, eine Notiz erstellt und gelöscht wird, und schließlich der Client über die Delete-API entfernt wird
- **THEN** gibt `POST /api/admin/clients/create` HTTP 201 mit `{ ok: true, userId }` zurück; der neue Client erscheint mit vollständigem Namen in der Liste (`data-testid="admin-client-item"`); Notizen sind in der Datenbank persistiert und nach dem Löschen nicht mehr sichtbar; der Client ist nach dem Löschen nicht mehr in der Liste vorhanden

---

### Requirement: Admin Follow-up CRUD Lifecycle with Done-State Toggle
<!-- e2e: fa-admin-db-crud-followups.spec.ts -->

The system SHALL allow an authenticated admin to create a follow-up with a reason and due date, mark it as done, verify the done state in the UI, and delete it, with each state change persisted to the database.

#### Scenario: Follow-up erstellen, als erledigt markieren, löschen *(E2E)*

- **GIVEN** ein Admin ist via Keycloak angemeldet und die Follow-up-Liste (`/admin/followups`) ist erreichbar
- **WHEN** ein Follow-up per `POST /api/admin/followups/create` mit Reason und Fälligkeitsdatum erstellt wird, danach per `POST /api/admin/followups/update` mit `done=true` als erledigt markiert wird, anschließend `/admin/followups?done=1` aufgerufen wird, und schließlich das Follow-up per Delete-Formular entfernt wird
- **THEN** erscheint das Follow-up nach Erstellung in der Liste mit dem angegebenen Reason-Text; nach dem Done-Update ist es in der erledigten Ansicht als erledigt dargestellt; nach dem Löschen ist es nicht mehr in der Liste sichtbar

---

### Requirement: Admin Projekte CRUD Lifecycle Including Subprojekt Creation
<!-- e2e: fa-admin-db-crud-projekte.spec.ts -->

The system SHALL allow an authenticated admin to create a project, navigate to its detail page, edit its name, create a sub-project, and delete the project (cascade), with all changes reflected in the website database and UI.

#### Scenario: Projekt erstellen, bearbeiten, Subprojekt anlegen, löschen *(E2E)*

- **GIVEN** ein Admin ist via Keycloak angemeldet und die Projekte-Liste (`/admin/projekte`) ist erreichbar
- **WHEN** ein Projekt per `POST /api/admin/projekte/create` mit Name, Status `entwurf` und Priority `mittel` erstellt wird, der Name per `POST /api/admin/projekte/update` geändert wird, ein Subprojekt erstellt wird, und schließlich das Projekt gelöscht wird
- **THEN** erscheint das Projekt nach Erstellung in der Liste; nach dem Update ist der neue Name sichtbar; das Subprojekt erscheint auf der Detailseite; nach dem Löschen ist das Projekt nicht mehr in der Liste vorhanden

---

### Requirement: Admin Shortcuts CRUD Lifecycle with Label Update
<!-- e2e: fa-admin-db-crud-shortcuts.spec.ts -->

The system SHALL allow an authenticated admin to create a shortcut with a URL and label via `POST /api/admin/shortcuts/create`, update the label via `PATCH /api/admin/shortcuts/update`, verify the updated label in the UI, delete the shortcut via `DELETE /api/admin/shortcuts/delete`, and confirm it no longer appears, with all changes persisted in the website database.

#### Scenario: Shortcut erstellen, Label aktualisieren, löschen *(E2E)*

- **GIVEN** ein Admin ist via Keycloak angemeldet und das Admin-Dashboard (`/admin`) ist erreichbar
- **WHEN** ein Shortcut per `POST /api/admin/shortcuts/create` mit URL und Label erstellt wird, das Label per `PATCH /api/admin/shortcuts/update` geändert wird, und der Shortcut per `DELETE /api/admin/shortcuts/delete` entfernt wird
- **THEN** gibt `POST /api/admin/shortcuts/create` ein JSON-Objekt mit `id`, `label` und `url` zurück; das ursprüngliche Label erscheint im Admin-Dashboard via `AdminShortcuts`-Svelte-Island; nach dem Update ist das neue Label sichtbar und das alte verschwunden; nach dem Löschen ist der Shortcut nicht mehr im Dashboard vorhanden

---

### Requirement: Arena DB Health Check Endpoint Returns OK
<!-- e2e: fa-39-arena-db.spec.ts -->

The system SHALL serve `GET /healthz` on the arena-server URL with HTTP 200 and `{ "ok": true }` so that readiness probes and E2E smoke tests can verify arena database connectivity without cluster access.

#### Scenario: /healthz gibt {"ok": true} zurück *(E2E)*

- **GIVEN** `ARENA_WS_URL` oder `PROD_DOMAIN` ist gesetzt und der arena-server ist erreichbar
- **WHEN** `GET <ARENA_URL>/healthz` abgerufen wird
- **THEN** ist der HTTP-Statuscode 200 und der Response-Body enthält `{ "ok": true }`

#### Scenario: Arena-Server-Basis-URL antwortet ohne 5xx *(E2E)*

- **GIVEN** `ARENA_WS_URL` oder `PROD_DOMAIN` ist gesetzt
- **WHEN** der Browser die arena-server-HTTP-URL aufruft
- **THEN** ist der `<body>` sichtbar und enthält weder `"502 Bad Gateway"` noch `"Internal Server Error"`

<!-- merged from change delta database.md (6daacaaf00f7) -->