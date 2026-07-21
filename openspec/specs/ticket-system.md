# ticket-system

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Dieses Dokument beschreibt das Ticket-System und seinen Lifecycle im Bachelorprojekt-Workspace.
Es umfasst die Datenstruktur, Statusübergänge, Brand-Isolation, Pipeline-Lanes, Reporter-Benachrichtigung,
Cockpit-Rollup, KI-gestützte Feature-Priorisierung und die Anforderungsverriegelung (Lastenheft-Lock).

---

## Requirements

### Requirement: Brand-Isolation

The system SHALL enforce that every ticket belongs to exactly one brand, and SHALL reject any read
or write operation that targets a ticket whose brand does not match the caller's brand context.

#### Scenario: Ticket aus fremdem Brand wird nicht zurückgegeben

- **GIVEN** ein Ticket mit `brand = 'korczewski'` ist in der Datenbank
- **WHEN** `getTicketDetail('mentolder', ticketId)` aufgerufen wird
- **THEN** wird `null` zurückgegeben (kein Fehler, kein Datenleck)

#### Scenario: Parent-Ticket-Validierung beim Erstellen

- **GIVEN** ein neues Ticket soll als Kind unter einer anderen Brand-Ticket angelegt werden
- **WHEN** `createAdminTicket` mit `parentId` einer Ticket-ID aus einer anderen Brand aufgerufen wird
- **THEN** wirft die Funktion einen Fehler und bricht die Transaktion ab

#### Scenario: Link-Validierung Brand-übergreifend

- **GIVEN** zwei Tickets aus unterschiedlichen Brands
- **WHEN** `addLink` mit beiden IDs aufgerufen wird
- **THEN** wird ein Fehler geworfen, weil beide Tickets zur selben Brand gehören müssen

---

### Requirement: Status-Lifecycle-Enforcement

The system SHALL only permit transitions to the 11 defined statuses (`triage`, `planning`,
`plan_staged`, `backlog`, `in_progress`, `in_review`, `qa_review`, `blocked`, `awaiting_deploy`,
`done`, `archived`) and SHALL reject any transition to an unknown status.

#### Scenario: Ungültiger Status wird abgelehnt

- **GIVEN** ein Ticket befindet sich in Status `in_progress`
- **WHEN** `transitionTicket` mit `status = 'closed'` aufgerufen wird
- **THEN** wird ein Fehler geworfen und die Datenbank bleibt unverändert

#### Scenario: Terminaler Status erfordert Resolution

- **GIVEN** ein Ticket soll auf `done` oder `archived` gesetzt werden
- **WHEN** `transitionTicket` ohne `resolution`-Parameter aufgerufen wird
- **THEN** wird ein Fehler geworfen (`status=done requires a resolution`)

#### Scenario: Resolution ist nur bei terminalen Status erlaubt

- **GIVEN** ein Ticket soll auf `in_progress` gesetzt werden
- **WHEN** `transitionTicket` mit einem `resolution`-Wert aufgerufen wird
- **THEN** wird ein Fehler geworfen, weil Resolution nur für `done`/`archived` gilt

---

### Requirement: Transaktionsatomarität bei Statusübergängen

The system SHALL perform status updates, optional status-change comments, PR-link recording, and
inbox-item synchronisation within a single PostgreSQL transaction and SHALL roll back all changes
on any failure.

#### Scenario: PR-Nummer wird beim Statusübergang verknüpft

- **GIVEN** ein Ticket wird auf `done` transitioniert
- **WHEN** `transitionTicket` mit `prNumber = 42` aufgerufen wird
- **THEN** wird ein Eintrag in `tickets.ticket_links` mit `kind = 'fixes'` und `pr_number = 42` angelegt (idempotent via ON CONFLICT)

#### Scenario: Bug-Inbox-Sync bei Abschluss

- **GIVEN** ein Bug-Ticket wird auf `done` oder `archived` transitioniert
- **WHEN** die Transaktion committed wird
- **THEN** werden zugehörige `inbox_items`-Zeilen mit Status `pending` auf `actioned` (done) bzw. `archived` aktualisiert, sodass der Admin-Badge gecleart wird

---

### Requirement: Pipeline-Lane-Ordnung als Single Source of Truth

The system SHALL derive all status-to-lane mappings and ordered pipeline status lists from the
single `PIPELINE_LANES` declaration in `pipeline-order.ts`; no other file SHALL define an
independent status ordering.

#### Scenario: Status-Bucket-Ableitung

- **GIVEN** `PIPELINE_LANES` ist die einzige Quelle der Reihenfolge
- **WHEN** `STATUS_BUCKETS` abgerufen wird
- **THEN** gibt es für jeden der 11 Status genau einen `LaneKey`-Eintrag, abgeleitet aus der Lane-Deklaration

#### Scenario: Side-Lanes sind vom linearen Pipeline-Fluss getrennt

- **GIVEN** `blocked` und `archived` sind als `side: true` deklariert
- **WHEN** `PIPELINE_STATUSES` (linear, ordered) abgerufen wird
- **THEN** sind `blocked` und `archived` nicht in der Liste enthalten

---

### Requirement: Cockpit-Rollup berechnet Feature-Gesundheit on-read

The system SHALL compute the health status (`green` / `amber` / `red`) of every container ticket
(type `project` or `feature`) on read via a recursive CTE that walks the full descendant tree,
counts only non-archived task/bug leaves, and applies the rule: any blocked leaf → `red`,
all leaves done → `green`, otherwise → `amber`.

#### Scenario: Blockiertes Leaf führt zu roter Ampel

- **GIVEN** ein Feature-Ticket hat 5 Leaf-Tickets, davon eines mit Status `blocked`
- **WHEN** `v_cockpit_rollup` für dieses Feature abgerufen wird
- **THEN** ist `health = 'red'` unabhängig vom Fortschritt der anderen Leaves

#### Scenario: Archivierte Leaves werden nicht gezählt

- **GIVEN** ein Feature hat 3 Leaves, 1 davon ist `archived`
- **WHEN** der Rollup berechnet wird
- **THEN** ist `total_leaves = 2` (archiviert zählt nicht zum Fortschritt)

---

### Requirement: Bug-Reporter-Benachrichtigung per E-Mail

The system SHALL send a localised German email to the bug reporter when a bug ticket transitions
to `done` for the first time, and SHALL additionally send a public-comment notification when an
admin posts a comment with `visibility = 'public'` on a bug ticket that has a reporter email.

#### Scenario: Bug-Abschluss-E-Mail wird gesendet

- **GIVEN** ein Bug-Ticket mit `reporter_email` wird von einem anderen Status auf `done` transitioniert
- **WHEN** die Transaktion erfolgreich abgeschlossen ist
- **THEN** wird `sendBugCloseEmail` aufgerufen mit der Resolution in lokalisiertem Deutsch (z. B. "fixed" → "behoben")

#### Scenario: Kein zweiter Close-E-Mail bei erneutem `done`

- **GIVEN** ein Bug-Ticket ist bereits im Status `done`
- **WHEN** `transitionTicket` erneut mit `status = 'done'` aufgerufen wird
- **THEN** wird keine E-Mail gesendet (Guard: `before.status !== 'done' && p.status === 'done'`)

#### Scenario: Öffentlicher Kommentar triggert Reporter-Benachrichtigung

- **GIVEN** ein Bug-Ticket mit `reporter_email` hat einen Admin-Kommentar
- **WHEN** `addComment` mit `visibility = 'public'` aufgerufen wird
- **THEN** wird eine E-Mail-Benachrichtigung an den Reporter versandt

---

### Requirement: Lastenheft-Lock sperrt Anforderungen und fördert Ticket in Pipeline

The system SHALL prevent editing of a locked requirements list (`lastenheft_locked = true`)
and SHALL, when the lock is applied from an early planning status, automatically advance the
ticket to `backlog` without regressing tickets that are already further along.

#### Scenario: Lock erfordert mindestens eine Anforderung

- **GIVEN** ein Ticket hat eine leere Anforderungsliste (`requirements_list = []`)
- **WHEN** `canLock` aufgerufen wird
- **THEN** wird `false` zurückgegeben und der Lock-Vorgang darf nicht ausgeführt werden

#### Scenario: Status-Advance beim Sperren aus Planungsphase

- **GIVEN** ein Ticket hat Status `planning`
- **WHEN** das Lastenheft gesperrt wird
- **THEN** wechselt der Status zu `backlog` (Forward-Transition via `nextStatusOnLock`)

#### Scenario: Kein Status-Regress bei bereits fortgeschrittenem Ticket

- **GIVEN** ein Ticket hat Status `in_progress`
- **WHEN** das Lastenheft nachträglich gesperrt wird
- **THEN** bleibt der Status `in_progress` (kein Regress auf `backlog`)

---

### Requirement: KI-gestützte Feature-Priorisierung über konfigurierbare LLM-Provider

The system SHALL offer an AI-assisted `nextStep` suggestion endpoint that supports multiple
configured LLM providers (at minimum `deepseek` and `anthropic`), builds a structured feature
list from the live portfolio, and parses the model response into a typed `Suggestion[]` result.

#### Scenario: Nur erlaubte Provider werden akzeptiert

- **GIVEN** die Provider-Liste enthält nur `deepseek` und `anthropic`
- **WHEN** ein API-Aufruf mit `provider = 'openai'` gemacht wird
- **THEN** gibt `resolveProvider('openai')` `null` zurück und der Request wird abgelehnt

#### Scenario: Synthetische Buckets werden aus dem LLM-Input ausgeschlossen

- **GIVEN** das Portfolio enthält die synthetischen Buckets "Alle Tickets" und "Ohne Feature"
- **WHEN** `buildFeatureList` aufgerufen wird
- **THEN** erscheinen diese Buckets nicht in der LLM-Eingabeliste (Flag `synthetic: true` filtert sie aus)

#### Scenario: Feature-Liste enthält Fortschritts-Signale

- **GIVEN** ein Feature hat `rollup.pctDone = 80`, `rollup.blocked = 1`, `health = 'red'`
- **WHEN** `buildFeatureList` die LLM-Eingabe erstellt
- **THEN** enthält der Feature-Eintrag explizit Fortschritt (%), Blockiert-Anzahl und Ampelstatus als Signale für das Modell

---

### Requirement: Reporter-Verlinkung mit Kundenprofil ist idempotent

The system SHALL automatically link a bug ticket's `reporter_email` to an existing `customers`
record (via `reporter_id`) whenever a matching Keycloak-authenticated customer exists, and SHALL
guarantee the link operation is safe to call multiple times without side effects.

#### Scenario: Link wird beim Bug-Abschluss gesetzt

- **GIVEN** ein Bug-Ticket hat `reporter_email = 'user@example.com'` und `reporter_id IS NULL`
- **GIVEN** ein `customers`-Eintrag mit `email = 'user@example.com'` und gültigem `keycloak_user_id` existiert
- **WHEN** das Ticket auf `done` transitioniert wird
- **THEN** wird `linkReporterByEmail` aufgerufen und `reporter_id` auf die UUID des Customers gesetzt

#### Scenario: Doppelter Aufruf verändert keinen weiteren Datensatz

- **GIVEN** `reporter_id` ist bereits gesetzt
- **WHEN** `linkReporterByEmail` erneut aufgerufen wird
- **THEN** werden null Zeilen aktualisiert (WHERE `reporter_id IS NULL` schlägt fehl — kein Fehler, kein Datenverlust)

---

### Requirement: Ticket-Erstellung erfordert Pflichtfelder und setzt attention_mode sicher

The system SHALL reject a `ticket.sh create` invocation that is missing `--type`, `--title`, or
`--description`, and SHALL always insert a valid `attention_mode` value by coalescing a missing or
empty argument to `'auto'` so that the NOT NULL column constraint is never violated.

#### Scenario: Fehlende Pflichtargumente werden abgelehnt

- **GIVEN** `ticket.sh create` wird ohne `--description` aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** beendet es sich mit Exit-Code ungleich 0 und gibt eine Meldung aus, die "required" enthält

#### Scenario: attention_mode verwendet COALESCE-Default auf 'auto'

- **GIVEN** `ticket.sh create` wird ohne `--attention-mode` aufgerufen
- **WHEN** das generierte SQL in der Datenbank ausgeführt wird
- **THEN** enthält das INSERT `COALESCE(NULLIF(:'attn', ''), 'auto')` als Wert für `attention_mode`, sodass nie NULL eingetragen wird

---

### Requirement: CLI-Subcommand add-pr-link verknüpft PR-Nummer mit Ticket

The system SHALL provide a `ticket.sh add-pr-link` subcommand that requires both `--id` (ticket
external ID) and `--pr` (integer PR number), and SHALL produce a valid INSERT into
`tickets.ticket_links` with `kind='pr'` and a populated `pr_number` — without referencing
non-existent columns such as `ref` or `url`.

#### Scenario: Fehlende oder ungültige Argumente werden abgelehnt

- **GIVEN** `ticket.sh add-pr-link` wird ohne `--pr` oder mit einem nicht-numerischen Wert aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** beendet es sich mit einem Fehler: bei fehlendem `--id`/`--pr` wird "--id and --pr are required" ausgegeben, bei nicht-numerischem `--pr` wird "--pr must be an integer" ausgegeben

#### Scenario: Korrektes SQL wird für ticket_links generiert

- **GIVEN** `ticket.sh add-pr-link --id T000123 --pr 1234` wird aufgerufen
- **WHEN** das Skript die UUID via SELECT ermittelt und den Link einfügt
- **THEN** enthält das generierte SQL sowohl ein `SELECT id FROM tickets.tickets` als auch ein `INSERT INTO tickets.ticket_links` mit den Feldern `kind`, `pr_number` und `to_id`, und enthält weder `ref` noch `url`

---

### Requirement: External-ID wird aus einer globalen Sequenz vergeben

The system SHALL assign `external_id` values via a single global PostgreSQL sequence
(`tickets.external_id_seq`) initialised with `setval` to the current maximum, and SHALL NOT use
per-brand counters (`ticket_counters`) to derive external IDs, preventing cross-brand collisions.

#### Scenario: Globale Sequenz wird für external_id verwendet

- **GIVEN** `tickets-db.ts` enthält die Funktion `fn_assign_external_id`
- **WHEN** die Datei auf den verwendeten Mechanismus geprüft wird
- **THEN** findet sich `nextval('tickets.external_id_seq')` im Code, und `ON CONFLICT (brand) DO UPDATE SET last_value` — das Muster des per-Brand-Counters — ist nicht vorhanden

#### Scenario: Sequenz wird beim Initialisieren auf den aktuellen Maximalwert gesetzt

- **GIVEN** das Datenbankschema wird initialisiert oder migriert
- **WHEN** `initTicketsSchema()` ausgeführt wird
- **THEN** wird `setval('tickets.external_id_seq', ...)` aufgerufen, um die Sequenz auf den höchsten bestehenden Wert aufzusetzen und Lücken oder Kollisionen zu vermeiden

---

### Requirement: Ticket-Graph liefert traversierten Abhängigkeitsgraph mit Critical Path

The system SHALL expose a `getTicketGraph` function and a `/api/tickets/graph` endpoint that
builds the full transitive dependency graph via a recursive CTE (max depth 10), computes a
critical path via topological sort, and returns only to authenticated admins (HTTP 401 otherwise).

#### Scenario: Abhängigkeitsgraph wird rekursiv traversiert

- **GIVEN** Tickets haben `depends_on`-Verweise, die mehrere Ebenen tief verschachtelt sind
- **WHEN** `getTicketGraph` aufgerufen wird
- **THEN** wird eine `WITH RECURSIVE`-CTE (Name: `dep_graph`) verwendet, die `depends_on` auswertet und bei Tiefe 10 abbricht, und das Ergebnis enthält `GraphNode`- und `GraphEdge`-Objekte

#### Scenario: API-Endpoint erzwingt Admin-Authentifizierung

- **GIVEN** ein nicht-administrativer Benutzer ruft `GET /api/tickets/graph` auf
- **WHEN** der Endpoint die Session prüft
- **THEN** wird HTTP 401 zurückgegeben; für authentifizierte Admins wird `getTicketGraph` aufgerufen und das Ergebnis als `application/json` zurückgegeben

---

### Requirement: Ticket-Triage klassifiziert Priorität und Schweregrad via LLM mit Retry

The system SHALL provide an `autoTriage` function that invokes an Anthropic Haiku model via the
ki-services provider registry, parses JSON from the LLM response with up to 2 attempts, maps the
returned priority (`low`/`medium`/`high`/`critical`) to German labels (`niedrig`/`mittel`/`hoch`),
validates the severity against `['critical','major','minor','trivial']`, and records the result as
an internal system comment on the ticket.

#### Scenario: Priorität wird korrekt auf deutsche Labels gemappt

- **GIVEN** das LLM gibt `priority: 'critical'` oder `priority: 'high'` zurück
- **WHEN** `autoTriage` das Ergebnis verarbeitet
- **THEN** wird `priority` auf `'hoch'` gemappt; unbekannte Prioritäten fallen auf `'mittel'` zurück; `medium` wird zu `'mittel'` und `low` zu `'niedrig'`

#### Scenario: Ungültige Severity und LLM-Fehler werden sicher behandelt

- **GIVEN** das LLM gibt einen ungültigen `severity`-Wert zurück oder schlägt nach 2 Versuchen fehl
- **WHEN** `autoTriage` das Ergebnis auswertet
- **THEN** fällt eine unbekannte Severity auf `'minor'` zurück; nach Retry-Erschöpfung gibt die Funktion `null` zurück und loggt "LLM call failed after retry"; Fehler in `autoTriage` werden gefangen und als "autoTriage failed" geloggt

#### Scenario: Triage-Kommentar wird mit korrekten Metadaten gespeichert

- **GIVEN** die Triage liefert ein valides Ergebnis
- **WHEN** das Ergebnis als Kommentar gespeichert wird
- **THEN** wird ein Kommentar mit `kind: 'system'`, `visibility: 'internal'` und `label: 'Auto-Triage'` angelegt, der Priority, Severity und Component enthält

---

### Requirement: Lastenheft-CLI validiert Subaction und sperrt Autopilot-Gate

The system SHALL validate the `lastenheft` subcommand — rejecting missing or unknown subactions
(exit 2), rejecting a missing `--id` (exit 2), refusing to lock an empty requirements list (exit 3)
— and SHALL store `plan-meta --requirements` as a pipe-separated array in `requirements_list`.
The factory queue SHALL gate autopilot dispatch on `lastenheft_locked = true`.

#### Scenario: Ungültige Subaction und fehlende --id werden abgelehnt

- **GIVEN** `ticket.sh lastenheft` wird ohne Subaction oder mit unbekannter Subaction aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** beendet es sich mit Exit-Code 2 und gibt "lock|unlock" aus; fehlt `--id` bei `lastenheft lock`, gibt es ebenfalls Exit 2 mit "--id is required"

#### Scenario: Leeres Lastenheft blockiert Lock, unlock setzt keinen Status-Forward

- **GIVEN** beim Lock-Versuch gibt die Datenbank 0 Anforderungen zurück
- **WHEN** `ticket.sh lastenheft lock --id T000123` ausgeführt wird
- **THEN** beendet es sich mit Exit-Code 3 und gibt "Lastenheft is empty" aus; `ticket.sh lastenheft unlock` setzt `lastenheft_locked:false` ohne einen "THEN 'backlog'"-Zweig im SQL

#### Scenario: plan-meta speichert pipe-separierte Anforderungen als Array

- **GIVEN** `ticket.sh plan-meta set --id T000123 --requirements 'Login via SSO|Export, als PDF'` wird aufgerufen
- **WHEN** das Skript die SQL-Anweisung erzeugt
- **THEN** enthält das SQL `requirements_list = COALESCE(ARRAY['Login via SSO','Export, als PDF'], requirements_list)`, wobei Kommas innerhalb von Elementen erhalten bleiben

---

### Requirement: PR-Events-Tabelle erzwingt eindeutige PR-Nummer und validen Status

The system SHALL maintain a `tickets.pr_events` table with a primary key on `pr_number` (rejecting
duplicate inserts) and a check constraint that limits the `status` column to a defined set of
values, with columns `pr_number`, `title`, `category`, `merged_at`, and `status`.

#### Scenario: Doppelte PR-Nummer wird abgelehnt

- **GIVEN** ein Eintrag mit `pr_number = -99001` existiert bereits in `tickets.pr_events`
- **WHEN** ein zweiter INSERT mit derselben `pr_number` versucht wird
- **THEN** schlägt der INSERT mit einer Unique/Duplicate-Verletzung fehl (Status ungleich 0)

#### Scenario: Ungültiger Status-Wert wird durch Check-Constraint abgelehnt

- **GIVEN** `tickets.pr_events` hat ein Check-Constraint auf den `status`-Wert
- **WHEN** ein INSERT mit `status = 'bogus'` versucht wird
- **THEN** schlägt der INSERT fehl (Exit-Code ungleich 0)

---

### Requirement: linkAllReporters verknüpft alle unverbundenen Bug-Tickets im Batch

The system SHALL provide a `linkAllReporters` function that finds all bug tickets where
`reporter_id IS NULL` and `reporter_email` matches a `customers` record with a valid
`keycloak_user_id`, updates them in a single parameterized query, and returns the count of
updated rows. All reporter-link SQL queries SHALL use parameterized placeholders (no string
interpolation) and both single and batch functions SHALL apply the `reporter_id IS NULL` guard.

#### Scenario: Batch-Verlinkung aktualisiert alle passenden Tickets

- **GIVEN** mehrere Bug-Tickets haben `reporter_email`-Werte, die Customers mit `keycloak_user_id` zugeordnet sind, und `reporter_id IS NULL`
- **WHEN** `linkAllReporters()` aufgerufen wird
- **THEN** gibt die Funktion mindestens 1 zurück und alle betroffenen Tickets haben danach einen gesetzten `reporter_id`-Wert

#### Scenario: SQL-Parameterisierung verhindert Injection

- **GIVEN** `reporter-link.ts` enthält SQL-Abfragen für Single- und Batch-Verlinkung
- **WHEN** der Code auf String-Interpolation geprüft wird
- **THEN** verwenden beide Funktionen `$1`-Platzhalter statt Template-Literals, und der `reporter_id IS NULL`-Guard sowie der `keycloak_user_id IS NOT NULL`-Filter kommen jeweils zweimal vor (einmal pro Funktion)

---

### Requirement: Schema-Sunset-Skript ist idempotent und erfordert explizites --apply

The system SHALL provide a `tickets-sunset.mjs` migration script that removes legacy schema
objects (`bugs.bug_tickets`, `bachelorprojekt.requirements`, `public.projects` etc.) using `IF
EXISTS` clauses, defaults to dry-run mode, and requires `--apply` to execute destructive changes.
The script SHALL detect whether a legacy object is a base table or a view via `pg_class.relkind`
before issuing DROP.

#### Scenario: Skript läuft ohne --apply im Dry-Run-Modus

- **GIVEN** `tickets-sunset.mjs` wird ohne `--apply`-Flag aufgerufen
- **WHEN** das Skript den Ausführungsmodus prüft
- **THEN** wird `process.argv.includes('--apply')` ausgewertet; ohne das Flag werden keine destruktiven Operationen ausgeführt; alle DROP-Anweisungen enthalten `IF EXISTS` für Idempotenz

#### Scenario: Objekt-Typ wird vor DROP aus pg_class ermittelt

- **GIVEN** ein Legacy-Objekt könnte entweder eine View oder eine Base Table sein
- **WHEN** das Skript das Objekt vor dem Löschen prüft
- **THEN** wird `relkind` aus `pg_class` gelesen, um den korrekten DROP-Typ zu wählen (TABLE vs. VIEW)

---

### Requirement: Statusübergänge setzen Timestamps und schreiben Audit-Log

The system SHALL set `started_at` when a ticket first transitions to `in_progress`, set `done_at`
when it transitions to `done`, create a `ticket_activity` row with `field='_updated'` on every
transition, and set PostgreSQL session-level `app.user_label` and `app.user_id` configuration
parameters before executing the transition SQL.

#### Scenario: Timestamp-Felder werden beim Übergang gesetzt

- **GIVEN** ein Ticket ist im Status `backlog`
- **WHEN** `transitionTicket` mit `status: 'in_progress'` aufgerufen wird
- **THEN** wird `started_at` auf einen Non-NULL-Wert gesetzt; beim Übergang nach `done` wird analog `done_at` gesetzt und `resolution` ist im Ergebnis-Objekt vorhanden

#### Scenario: Audit-Log-Eintrag und Session-Kontext werden bei jedem Übergang geschrieben

- **GIVEN** ein Ticket-Übergang wird ausgelöst
- **WHEN** `transitionTicket` die Transaktion ausführt
- **THEN** wird mindestens ein Eintrag in `tickets.ticket_activity` mit `field='_updated'` angelegt; zuvor setzt die Funktion `app.user_label` und `app.user_id` als PostgreSQL-Session-Parameter (via `pool.connect()` mit explizitem BEGIN/COMMIT/ROLLBACK)

---

### Requirement: transitionTicket gibt ein typisiertes TransitionResult-Objekt zurück

The system SHALL return a `TransitionResult` object containing the fields `id`, `externalId`,
`type`, `status`, `resolution`, and `emailSent` from every successful `transitionTicket` call,
and SHALL allow an optional transition `note` to be persisted as a `ticket_comments` row with
`kind='status_change'`.

#### Scenario: TransitionResult enthält alle Pflichtfelder

- **GIVEN** ein Ticket wird erfolgreich auf `done` mit `resolution: 'wontfix'` transitioniert
- **WHEN** `transitionTicket` das Ergebnis zurückgibt
- **THEN** enthält das Objekt die Felder `id`, `externalId`, `type`, `status` (= 'done'), `resolution` (= 'wontfix') und `emailSent`

#### Scenario: Optionaler Note-Parameter wird als status_change-Kommentar gespeichert

- **GIVEN** `transitionTicket` wird mit `note: 'shipped in v1.2'` und `noteVisibility: 'internal'` aufgerufen
- **WHEN** die Transaktion abgeschlossen wird
- **THEN** existiert genau ein Eintrag in `tickets.ticket_comments` mit `kind='status_change'` und `body='shipped in v1.2'` für das betreffende Ticket

---

### Requirement: Planungsbüro berechnet Stats (planning/ready/blocked) aus DoR-Score

The system SHALL compute Planungsbüro statistics by counting all items as `planning`, counting
items with `dorScore === 4` as `ready`, and counting items with unresolved dependencies
(`dependsOn.length > 0`) and `dorScore < 4` as `blocked`. An invalid `effort` value SHALL be
rejected against the allowed list `['klein', 'mittel', 'gross']`.

#### Scenario: Stats-Berechnung aus einer Liste von Items

- **GIVEN** eine Liste enthält 4 Items: zwei mit niedrigem DoR-Score, eines mit `dorScore = 4`, eines mit `dorScore = 2` und einer Abhängigkeit
- **WHEN** `computeStats` aufgerufen wird
- **THEN** ist `planning = 4`, `ready = 1`, `blocked = 1`; bei leerer Liste ist das Ergebnis `{ planning: 0, ready: 0, blocked: 0 }`

#### Scenario: Ungültiger effort-Wert wird abgelehnt

- **GIVEN** ein PATCH-Request wird mit `effort = 'riesig'` gesendet
- **WHEN** die Validierung den Wert gegen `['klein', 'mittel', 'gross']` prüft
- **THEN** gibt `valid.includes(effort)` `false` zurück und der Request wird abgelehnt

---

### Requirement: Inert pg_notify Trigger feuert ausschließlich bei Feature-Inserts

The system SHALL define a PostgreSQL trigger function `tickets.notify_feature_inserted` that fires
AFTER INSERT on `tickets.tickets` only when `NEW.type = 'feature'`, broadcasts on the channel
`factory_feature_inserted`, and SHALL be explicitly documented as NOT-CONSUMED so no phantom
consumer is accidentally wired.

#### Scenario: Trigger-Funktion und Kanal sind im Schema vorhanden

- **GIVEN** `initTicketsSchema()` wurde ausgeführt
- **WHEN** der Quellcode von `tickets-db.ts` auf Trigger-Definition geprüft wird
- **THEN** enthält er sowohl `CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted` als auch den Kanalnamen `factory_feature_inserted`

#### Scenario: Trigger ist als nicht-konsumiert dokumentiert

- **GIVEN** das Trigger-DDL in `tickets-db.ts`
- **WHEN** der Code auf das Load-Bearing-Kommentar geprüft wird
- **THEN** enthält die Datei einen Kommentar, der `NOT-CONSUMED` oder `not consumed in Phase 3` beschreibt, damit kein Phantom-Consumer verdrahtet wird

---

### Requirement: Feature-Flag-Abfrage schlägt bei DB-Ausfall fail-closed auf false zurück

The system SHALL provide an `isFeatureEnabled(brand, key)` function that queries
`tickets.feature_flags` with both `brand` and `key` as bound parameters, returns `true` only when
an enabled row exists for the exact `(brand, key)` combination, and SHALL return `false` — without
throwing — when the query throws any error (fail-closed).

#### Scenario: Aktiviertes Flag wird für die korrekte Brand zurückgegeben

- **GIVEN** ein Eintrag in `tickets.feature_flags` mit `brand='mentolder'`, `key='new-hero'` und `enabled=true` existiert
- **WHEN** `isFeatureEnabled('mentolder', 'new-hero')` aufgerufen wird
- **THEN** gibt die Funktion `true` zurück und die Query verwendet `['mentolder', 'new-hero']` als Bind-Parameter

#### Scenario: DB-Fehler führt zu false statt zu einem geworfenen Fehler

- **GIVEN** die Datenbankverbindung schlägt fehl (`db down`)
- **WHEN** `isFeatureEnabled('mentolder', 'x')` aufgerufen wird
- **THEN** resolved das Promise mit `false` (kein throw, kein unhandled rejection)

---

### Requirement: Provider-Config-Schema unterstützt Coaching-Tier und Wildcard-Anthropic-Seeds

The system SHALL store provider routing configuration in `tickets.provider_config` with a `brand`
column (default `'*'`), allow any `tier` value including `'coaching'` (tier validation is
app-side), seed wildcard Anthropic rows for `sonnet` and `haiku` at priority 99 on schema
initialization, and maintain a separate `tickets.provider_health` table keyed by `provider` with
`failure_count` and `cooldown_until` columns.

#### Scenario: Coaching-Tier und Brand-Spalte können gesetzt werden

- **GIVEN** das Schema `tickets.provider_config` ist initialisiert
- **WHEN** eine Zeile mit `brand='mentolder'`, `source='coaching'`, `tier='coaching'` eingefügt wird
- **THEN** kann die Zeile ohne Constraint-Fehler gespeichert werden, und `SELECT brand, tier` gibt `{ brand: 'mentolder', tier: 'coaching' }` zurück

#### Scenario: Wildcard-Anthropic-Seeds für sonnet und haiku sind vorhanden

- **GIVEN** `initProviderConfigSchema()` wurde ausgeführt
- **WHEN** `tickets.provider_config` nach `source='*' AND provider='anthropic'` abgefragt wird
- **THEN** enthält das Ergebnis genau zwei Zeilen mit den Tiers `['haiku', 'sonnet']` (alphabetisch)

---

### Requirement: Provider-Health-Cooldown wird per UPSERT gesetzt und ist zeitgestempelt

The system SHALL expose a `setProviderCooldown(pool, source, provider, minutes)` helper that
inserts or updates a row in `tickets.provider_health` for the given `provider`, sets
`cooldown_until` to a future timestamp (`now() + interval`), and SHALL guarantee that a
`getProviderConfig` call resolves the highest-priority enabled row for the requested `(source,
tier)` combination.

#### Scenario: Cooldown-Timestamp liegt nach dem aktuellen Zeitpunkt

- **GIVEN** kein Eintrag für `provider='deepseek'` in `tickets.provider_health` existiert
- **WHEN** `setProviderCooldown(pool, 'ticket-triage', 'deepseek', 5)` aufgerufen wird
- **THEN** existiert danach genau eine Zeile für `deepseek` und `cooldown_until` liegt in der Zukunft

#### Scenario: getProviderConfig löst den ranghöchsten aktiven Provider auf

- **GIVEN** eine Zeile mit `source='assistant-chat'`, `tier='sonnet'`, `provider='local-cluster'` und `base_url='http://llm-gw:11434/v1'` existiert
- **WHEN** `getProviderConfig('assistant-chat', 'sonnet')` aufgerufen wird
- **THEN** gibt die Funktion `{ provider: 'local-cluster', apiKey: <non-empty> }` zurück

---

### Requirement: Ticket-Embedding-Modell wählt bge-m3 oder voyage-multilingual-2 anhand LLM_ENABLED

The system SHALL select the embedding model for tickets based on the `LLM_ENABLED` environment
variable: `bge-m3` when `LLM_ENABLED=true`, `voyage-multilingual-2` when `LLM_ENABLED=false`,
and SHALL tag every inserted embedding row with `embedding_model` and `chunk_type` columns.

#### Scenario: bge-m3 wird bei aktiviertem LLM gewählt

- **GIVEN** `process.env.LLM_ENABLED = 'true'`
- **WHEN** `ticketEmbeddingModel()` aufgerufen wird
- **THEN** gibt die Funktion `'bge-m3'` zurück

#### Scenario: voyage-multilingual-2 ist der Fallback bei deaktiviertem LLM

- **GIVEN** `process.env.LLM_ENABLED = 'false'`
- **WHEN** `ticketEmbeddingModel()` aufgerufen wird
- **THEN** gibt die Funktion `'voyage-multilingual-2'` zurück

---

### Requirement: embedTicket ist best-effort und schreibt Embeddings mit Chunk-Metadaten

The system SHALL chunk ticket content, call `embedBatch` once per chunk set, insert rows into
`tickets.ticket_embeddings` with the columns `embedding_model` and `chunk_type` bound to the
active model and chunk type, and SHALL catch `EmbeddingIndexError` silently — resolving with `0`
instead of throwing — so that embedding failures never surface to callers.

#### Scenario: Embedding-Insert enthält Modell- und Chunk-Typ-Metadaten

- **GIVEN** `LLM_ENABLED=true` und `embedBatch` liefert einen Vektor
- **WHEN** `embedTicket('uuid-1', { title: 'Add X', description: 'Body' })` aufgerufen wird
- **THEN** enthält das generierte INSERT-SQL `embedding_model` als Spalte und die Bind-Parameter schließen `['uuid-1', 'summary', 'bge-m3']` ein

#### Scenario: EmbeddingIndexError wird abgefangen und gibt 0 zurück

- **GIVEN** `embedBatch` wirft einen `EmbeddingIndexError`
- **WHEN** `embedTicket('uuid-2', { title: 'T', description: 'D' })` aufgerufen wird
- **THEN** resolved das Promise mit `0` statt zu werfen

---

### Requirement: findSimilarTickets erzwingt Modell-Konsistenz und gibt [] bei leerer Embedding-Tabelle zurück

The system SHALL query the distinct `embedding_model` values from `tickets.ticket_embeddings`
before searching, embed the query text using that model, throw `MixedEmbeddingModelError` when
more than one model is detected in the index, and resolve with an empty array when no embeddings
exist yet (fail-soft for Scout).

#### Scenario: Gemischte Embedding-Modelle lösen MixedEmbeddingModelError aus

- **GIVEN** `tickets.ticket_embeddings` enthält Zeilen mit sowohl `embedding_model='bge-m3'` als auch `embedding_model='voyage-multilingual-2'`
- **WHEN** `findSimilarTickets('q', 5)` aufgerufen wird
- **THEN** rejects das Promise mit einer Instanz von `MixedEmbeddingModelError`

#### Scenario: Leere Embedding-Tabelle ergibt leeres Ergebnis-Array

- **GIVEN** `tickets.ticket_embeddings` enthält keine Zeilen
- **WHEN** `findSimilarTickets('q', 5)` aufgerufen wird
- **THEN** resolved das Promise mit `[]` ohne Fehler

---

### Requirement: backfillTicketEmbeddings ist idempotent und überspringt bereits indizierte Tickets

The system SHALL select only tickets that lack an embedding row for the current model, embed and
insert them in batches, and on a second run with all tickets already embedded, call `embedBatch`
zero times and report `{ embedded: 0 }`.

#### Scenario: Erster Lauf befindet und indiziert alle fehlenden Tickets

- **GIVEN** zwei Tickets ohne Embeddings für das aktuelle Modell existieren
- **WHEN** `backfillTicketEmbeddings({ batchSize: 50 })` zum ersten Mal aufgerufen wird
- **THEN** gibt die Funktion `{ embedded: 2 }` zurück

#### Scenario: Zweiter Lauf ist ein No-op wenn alle Tickets bereits indiziert sind

- **GIVEN** alle Tickets haben bereits Embedding-Zeilen für das aktuelle Modell
- **WHEN** `backfillTicketEmbeddings({ batchSize: 50 })` erneut aufgerufen wird
- **THEN** gibt die Funktion `{ embedded: 0 }` zurück und `embedBatch` wird nicht aufgerufen

---

### Requirement: external_id-Sequenz-Reseed ist monoton (nie rückwärts)

The system SHALL reseed `tickets.external_id_seq` (in `applyLegacyMigrations()`, run on
every schema-init) using `GREATEST()` over the table's observed `MAX(external_id)` and the
sequence's own current `last_value`, and SHALL NOT overwrite the sequence with a value lower
than its current `last_value`, preventing a concurrent schema-init reseed from re-issuing an
`external_id` already dispensed (committed or not) by a concurrent `nextval()` call.

#### Scenario: Reseed reduziert die Sequenz nicht unter ihren aktuellen Stand *(BATS)*

- **GIVEN** `website/src/lib/tickets/migrations.ts` enthält den periodischen
  `setval('tickets.external_id_seq', ...)`-Reseed in `applyLegacyMigrations()`
- **WHEN** die Reseed-Anweisung auf ihr SQL-Muster geprüft wird
- **THEN** enthält sie `GREATEST(` und referenziert sowohl `MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT))` aus der Tabelle als auch `last_value FROM tickets.external_id_seq` (den aktuellen Sequenzstand), sodass der Reseed niemals einen niedrigeren Wert setzt als den, den die Sequenz bereits erreicht hat

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/ticket-system.bats`) that establishes
initial, spec-linked test coverage for the ticket-system SSOT spec, per the "one BATS file per
OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/ticket-system.bats` exists
- **WHEN** `bats tests/spec/ticket-system.bats` is run
- **THEN** the placeholder test `ticket-system spec covered` passes

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: CLI add-pr-link erzwingt valide Argumente und korrektes SQL
<!-- bats: ticket-add-pr-link.bats -->

The system SHALL reject `ticket.sh add-pr-link` invocations with missing or non-integer arguments and SHALL produce INSERT SQL referencing `kind`, `pr_number`, and `to_id` without non-existent columns.

#### Scenario: Fehlende --id oder --pr werden abgelehnt *(BATS)*
- **GIVEN** `ticket.sh add-pr-link --id T000123` ohne `--pr` wird aufgerufen
- **WHEN** das Skript die Argumente prüft
- **THEN** beendet es sich mit Exit-Code ungleich 0 und gibt "--id and --pr are required" aus

#### Scenario: Nicht-numerisches --pr wird abgelehnt *(BATS)*
- **GIVEN** `ticket.sh add-pr-link --id T000123 --pr abc` wird aufgerufen
- **WHEN** das Skript den Wert validiert
- **THEN** beendet es sich mit Exit-Code ungleich 0 und gibt "--pr must be an integer" aus

#### Scenario: Korrektes SQL für ticket_links wird generiert *(BATS)*
- **GIVEN** `ticket.sh add-pr-link --id T000123 --pr 1234` wird aufgerufen
- **WHEN** das Skript die SQL-Anweisungen erzeugt
- **THEN** enthält die Ausgabe sowohl `SELECT id FROM tickets.tickets` als auch `INSERT INTO tickets.ticket_links` mit den Feldern `kind`, `pr_number` und `to_id`; die Felder `ref` und `url` kommen nicht vor

---

### Requirement: CLI create erzwingt Pflichtargumente und setzt attention_mode sicher
<!-- bats: ticket-create.bats -->

The system SHALL reject `ticket.sh create` without `--type`, `--title`, or `--description`, and SHALL always use `COALESCE(NULLIF(:'attn', ''), 'auto')` so the `attention_mode` NOT NULL constraint is never violated.

#### Scenario: Fehlende Pflichtargumente führen zu Fehler *(BATS)*
- **GIVEN** `ticket.sh create --type bug --title "x"` ohne `--description` wird aufgerufen
- **WHEN** das Skript die Argumente prüft
- **THEN** beendet es sich mit Exit-Code ungleich 0 und gibt eine Meldung aus, die "required" enthält

#### Scenario: attention_mode wird nie NULL eingefügt *(BATS)*
- **GIVEN** `ticket.sh create --type bug --title "T" --description "D"` ohne `--attention-mode`
- **WHEN** das Skript das INSERT generiert
- **THEN** enthält das SQL `COALESCE(NULLIF(:'attn', ''), 'auto')` als Wert für `attention_mode`

#### Scenario: Expliziter --attention-mode wird durchgereicht *(BATS)*
- **GIVEN** `ticket.sh create` mit `--attention-mode ai_ready`
- **WHEN** das Skript das INSERT generiert
- **THEN** enthält das SQL weiterhin `COALESCE(NULLIF(:'attn', ''), 'auto')` (Wert wird via `-v attn=` übergeben)

---

### Requirement: external_id nutzt globale Sequenz statt per-Brand-Counter
<!-- bats: ticket-external-id-sequence.bats -->

The system SHALL assign external IDs via `nextval('tickets.external_id_seq')` and SHALL NOT use `ON CONFLICT (brand) DO UPDATE SET last_value` patterns; the sequence SHALL be seeded to the current max on init.

#### Scenario: Globale Sequenz wird für external_id verwendet *(BATS)*
- **GIVEN** `website/src/lib/tickets-db.ts` enthält `fn_assign_external_id`
- **WHEN** die Datei auf den verwendeten Mechanismus geprüft wird
- **THEN** findet sich `nextval('tickets.external_id_seq')` im Code

#### Scenario: Per-Brand-Counter-Muster ist nicht vorhanden *(BATS)*
- **GIVEN** `tickets-db.ts` enthält die Funktion `fn_assign_external_id`
- **WHEN** der Code auf `ON CONFLICT (brand) DO UPDATE SET last_value` geprüft wird
- **THEN** gibt es keinen Treffer (kein per-Brand-Counter)

#### Scenario: Sequenz wird beim Init auf den aktuellen Maximalwert gesetzt *(BATS)*
- **GIVEN** das Datenbankschema wird initialisiert
- **WHEN** `initTicketsSchema()` ausgeführt wird
- **THEN** enthält der Code `setval('tickets.external_id_seq', ...)` zur Vermeidung von Kollisionen

---

### Requirement: Ticket-Graph-Bibliothek exportiert alle erforderlichen Typen und Funktionen
<!-- bats: ticket-graph.bats -->

The system SHALL export `getTicketGraph`, `TicketGraph`, `GraphNode`, `GraphEdge` interfaces, use a recursive CTE named `dep_graph` with depth limit 10, compute a critical path via topological sort, and the API endpoint SHALL return 401 for unauthenticated callers.

#### Scenario: Alle Graph-Exports sind vorhanden *(BATS)*
- **GIVEN** `website/src/lib/ticket-graph.ts` existiert
- **WHEN** die Datei auf Export-Deklarationen geprüft wird
- **THEN** exportiert sie `getTicketGraph`, `TicketGraph`, `GraphNode`, und `GraphEdge`

#### Scenario: Rekursive CTE mit Tiefenlimit wird verwendet *(BATS)*
- **GIVEN** `ticket-graph.ts` implementiert den Graph-Traversal
- **WHEN** die Datei auf SQL-Muster geprüft wird
- **THEN** enthält sie `WITH RECURSIVE`, `dep_graph`, `depends_on` und `depth < 10`

#### Scenario: Critical-Path-Berechnung via Topological Sort *(BATS)*
- **GIVEN** `ticket-graph.ts` berechnet den kritischen Pfad
- **WHEN** die Datei auf die Implementierung geprüft wird
- **THEN** enthält sie `computeCriticalPath` mit `inDeg` (in-degree für topologische Sortierung)

#### Scenario: API-Endpoint gibt 401 bei fehlendem Admin zurück *(BATS)*
- **GIVEN** `website/src/pages/api/tickets/graph.ts` existiert
- **WHEN** die Datei auf Auth-Prüfung geprüft wird
- **THEN** enthält sie `isAdmin`, gibt `application/json` zurück und hat eine `401`-Antwort für Unauthentifizierte

#### Scenario: Nachfolger-Bereitschaft wird via depends_on aktualisiert *(BATS)*
- **GIVEN** `ticket-readiness.ts` exportiert `updateSuccessorReadiness`
- **WHEN** die Datei auf SQL-Muster geprüft wird
- **THEN** enthält sie `$1 = ANY(depends_on)` und setzt `abhaengigkeiten_klar`

---

### Requirement: Lastenheft-CLI validiert Subaction, sperrt Lock bei leerem Lastenheft und schreibt korrektes SQL
<!-- bats: ticket-lastenheft.bats -->

The system SHALL reject unknown lastenheft subactions with exit 2, refuse to lock an empty requirements list with exit 3, write `lastenheft_locked:true` and the `CASE WHEN status IN ('triage','planning','plan_staged') THEN 'backlog' ELSE status END` forward-transition on lock, and omit the `THEN 'backlog'` branch on unlock.

#### Scenario: Fehlende oder unbekannte Subaction wird mit Exit 2 abgelehnt *(BATS)*
- **GIVEN** `ticket.sh lastenheft` wird ohne Subaction oder mit `frobnicate` aufgerufen
- **WHEN** das Skript die Argumente prüft
- **THEN** beendet es sich mit Exit-Code 2 und gibt "lock|unlock" aus; bei fehlendem `--id` für `lock` ebenfalls Exit 2

#### Scenario: Lock setzt Flag und Forward-Transition *(BATS)*
- **GIVEN** `ticket.sh lastenheft lock --id T000123` wird mit einer Datenbank aufgerufen, die 1 Anforderung zurückgibt
- **WHEN** das Skript das SQL erzeugt
- **THEN** enthält das SQL `"lastenheft_locked":true`, `COALESCE(readiness,'{}')` und `CASE WHEN status IN ('triage','planning','plan_staged') THEN 'backlog' ELSE status END`

#### Scenario: Lock verweigert leeres Lastenheft mit Exit 3 *(BATS)*
- **GIVEN** die Datenbank gibt 0 Anforderungen für das Ticket zurück
- **WHEN** `ticket.sh lastenheft lock --id T000123` ausgeführt wird
- **THEN** beendet es sich mit Exit-Code 3 und gibt "Lastenheft is empty" aus

#### Scenario: Unlock setzt Flag auf false ohne Status-Transition *(BATS)*
- **GIVEN** `ticket.sh lastenheft unlock --id T000123` wird aufgerufen
- **WHEN** das Skript das SQL erzeugt
- **THEN** enthält das SQL `"lastenheft_locked":false` und enthält KEIN `THEN 'backlog'`

#### Scenario: plan-meta speichert pipe-separierte Anforderungen als Array *(BATS)*
- **GIVEN** `ticket.sh plan-meta set --id T000123 --requirements 'Login via SSO|Export, als PDF'`
- **WHEN** das Skript das SQL erzeugt
- **THEN** enthält das SQL `requirements_list = COALESCE(ARRAY['Login via SSO','Export, als PDF'], requirements_list)` — Kommas innerhalb von Elementen bleiben erhalten

#### Scenario: Autopilot-Gate prüft lastenheft_locked in queue.sh *(BATS)*
- **GIVEN** `scripts/factory/queue.sh` enthält den Autopilot-Dispatch
- **WHEN** der Code auf das Gate geprüft wird
- **THEN** enthält er `COALESCE((readiness->>'lastenheft_locked')::boolean, false) = true`

---

### Requirement: Ticket-Triage exportiert alle Typen und nutzt korrekten LLM-Provider
<!-- bats: ticket-triage.bats -->

The system SHALL export `autoTriage`, `runTriage`, and `TriageResult`; use `getProviderConfig(SOURCE.ticketTriage, 'haiku')` from the ki-services registry; implement retry (`attempt < 2`); map priorities to German labels; validate severities; create system comments; and integrate with ticket/bug creation endpoints.

#### Scenario: Alle Triage-Exports und Provider-Konfiguration sind vorhanden *(BATS)*
- **GIVEN** `website/src/lib/ticket-triage.ts` existiert
- **WHEN** die Datei auf Exports und Provider-Imports geprüft wird
- **THEN** exportiert sie `autoTriage`, `runTriage`, `TriageResult`; importiert `Anthropic` und verwendet `getProviderConfig(SOURCE.ticketTriage, 'haiku')` mit `import { SOURCE } from './ki-services'`

#### Scenario: Prompt enthält alle erforderlichen Felder und fordert JSON-Antwort *(BATS)*
- **GIVEN** der Triage-Prompt ist in `ticket-triage.ts` definiert
- **WHEN** die Datei auf Prompt-Inhalte geprüft wird
- **THEN** enthält der Prompt `Titel:`, `Beschreibung:`, `Typ:`, `JSON-Objekt`, `low|medium|high|critical` und `critical|major|minor|trivial`

#### Scenario: JSON-Parsing mit Retry-Logik ist implementiert *(BATS)*
- **GIVEN** das LLM gibt eine Antwort zurück
- **WHEN** `ticket-triage.ts` die Antwort verarbeitet
- **THEN** verwendet die Datei `text.match` für Regex-Extraktion, `JSON.parse` und `attempt < 2` für bis zu 2 Versuche

#### Scenario: Prioritäts-Mapping und Severity-Validierung sind vollständig *(BATS)*
- **GIVEN** das LLM gibt Prioritäts- und Severity-Werte zurück
- **WHEN** `ticket-triage.ts` die Werte verarbeitet
- **THEN** sind `high: 'hoch'`, `critical: 'hoch'`, `medium: 'mittel'`, `low: 'niedrig'` und der Fallback `PRIORITY_MAP[...] ?? 'mittel'` vorhanden; `VALID_SEVERITIES` enthält `critical|major|minor|trivial` mit Fallback `: 'minor'`

#### Scenario: Fehlerbehandlung bei leerem Ticket und LLM-Ausfall *(BATS)*
- **GIVEN** Titel und Beschreibung sind leer oder das LLM schlägt nach 2 Versuchen fehl
- **WHEN** `autoTriage` aufgerufen wird
- **THEN** gibt die Funktion `null` zurück; bei leerem Ticket wegen `!title && !description`, nach Retry wegen "LLM call failed after retry"; `autoTriage` fängt alle Fehler und loggt "autoTriage failed"

#### Scenario: Triage-Kommentar wird mit kind=system und visibility=internal gespeichert *(BATS)*
- **GIVEN** die Triage liefert ein valides Ergebnis
- **WHEN** der Kommentar angelegt wird
- **THEN** enthält `ticket-triage.ts` `kind: 'system'`, `visibility: 'internal'`, `label: 'Auto-Triage'` sowie `Priority:`, `Severity:`, `Component:` im Kommentartext

#### Scenario: autoTriage wird nach Ticket- und Bug-Erstellung aufgerufen *(BATS)*
- **GIVEN** `admin/tickets/index.ts`, `admin/bugs/create.ts` und `tickets/comment.ts` importieren `autoTriage`
- **WHEN** die Endpunkte ein Ticket oder einen Bug erstellen bzw. einen Kommentar anlegen
- **THEN** rufen alle drei Endpunkte `void autoTriage(...)` auf (fire-and-forget)

#### Scenario: Triage API-Endpoint erzwingt Admin-Auth und gibt 403 zurück *(BATS)*
- **GIVEN** `website/src/pages/api/admin/tickets/[id]/triage.ts` existiert
- **WHEN** ein nicht-administrativer Request eingeht
- **THEN** gibt der Endpoint `status: 403` zurück; bei fehlendem `id` gibt er "id missing" aus

---

### Requirement: Migration bugs→tickets ist transaktional, idempotent und schreibt STATUS_MAP korrekt
<!-- bats: tickets-migration.bats -->

The system SHALL provide `migrate-bugs-to-tickets.mjs` that wraps mutations in BEGIN/COMMIT/ROLLBACK, uses `--apply` to leave dry-run mode, maps `open→triage`, `resolved→done+fixed`, `archived→archived+fixed`, maps categories to `kind:bug/improvement/wish` tags, slices title to 200 chars, migrates `resolution_note` as `status_change` comments with `author_label='migration'`, migrates `fixed_in_pr` to `ticket_links`, and replaces `bugs.bug_tickets` with a view post-migration.

#### Scenario: Migrations-Skript ist idempotent via external_id-Check *(BATS)*
- **GIVEN** `scripts/migrate-bugs-to-tickets.mjs` existiert
- **WHEN** das Skript auf den Idempotenz-Check geprüft wird
- **THEN** enthält es `WHERE external_id = $1`

#### Scenario: Apply-Modus wraps alles in BEGIN/COMMIT/ROLLBACK *(BATS)*
- **GIVEN** `--apply` Flag ist gesetzt
- **WHEN** das Skript Datenbankoperationen ausführt
- **THEN** enthält der Code `BEGIN`, `COMMIT` und `ROLLBACK`

#### Scenario: Dry-Run ist der Default ohne --apply *(BATS)*
- **GIVEN** das Skript wird ohne `--apply` aufgerufen
- **WHEN** der Code auf den Modus geprüft wird
- **THEN** enthält das Skript `process.argv.includes('--apply')` und ein `dryRun`-Flag

#### Scenario: STATUS_MAP deckt alle Legacy-Status ab *(BATS)*
- **GIVEN** `migrate-bugs-to-tickets.mjs` enthält `STATUS_MAP`
- **WHEN** der Code geprüft wird
- **THEN** sind `open→triage`, `resolved→done`, `archived→archived` und `'fixed'` als Resolution vorhanden

#### Scenario: CATEGORY_TAG mappt alle drei Bug-Kategorien *(BATS)*
- **GIVEN** Bug-Tickets haben die Kategorie `fehler`, `verbesserung` oder `erweiterungswunsch`
- **WHEN** das Skript die Tags erstellt
- **THEN** sind `fehler→kind:bug`, `verbesserung→kind:improvement`, `erweiterungswunsch→kind:wish` im Code vorhanden

#### Scenario: Migration kopiert resolution_note als status_change-Kommentar *(BATS)*
- **GIVEN** ein Bug-Ticket hat einen `resolution_note`-Wert
- **WHEN** das Skript migriert
- **THEN** enthält der Code `'migration'` als `author_label` und `'status_change'` als Kommentar-Kind

#### Scenario: bugs.bug_tickets wird nach der Migration zur View *(BATS)*
- **GIVEN** das Migrationsskript wird mit `--apply` ausgeführt
- **WHEN** das Skript die Compat-View anlegt
- **THEN** enthält der Code `CREATE OR REPLACE VIEW bugs.bug_tickets` und `bug_tickets_legacy`; `relkind='v'` nach der Migration

---

### Requirement: plan_staged ist im Status-CHECK und allen TypeScript-Typen enthalten
<!-- bats: tickets-plan-staged-migration.bats -->

The system SHALL include `plan_staged` in the PostgreSQL CHECK constraint between `planning` and `backlog`, use `DROP CONSTRAINT IF EXISTS tickets_status_check` for idempotent migration, and include `plan_staged` in the `TicketStatus` union in `admin.ts` and `transition.ts` (at least twice in `transition.ts`).

#### Scenario: plan_staged steht im DB-CHECK zwischen planning und backlog *(BATS)*
- **GIVEN** `website/src/lib/tickets-db.ts` enthält das Schema
- **WHEN** die Datei auf den Status-CHECK geprüft wird
- **THEN** findet sich `'planning','plan_staged','backlog'` als Reihenfolge im CHECK-Constraint

#### Scenario: Status-Migration ist idempotent via DROP CONSTRAINT IF EXISTS *(BATS)*
- **GIVEN** das Schema wird wiederholt angewendet
- **WHEN** der Migrations-Code ausgeführt wird
- **THEN** enthält `tickets-db.ts` `DROP CONSTRAINT IF EXISTS tickets_status_check`

#### Scenario: plan_staged ist in allen TypeScript-Typ-Unionen vorhanden *(BATS)*
- **GIVEN** `admin.ts` und `transition.ts` definieren `TicketStatus`
- **WHEN** die Dateien auf plan_staged geprüft werden
- **THEN** enthält `admin.ts` `plan_staged` und `transition.ts` enthält es mindestens zweimal (Typ-Union + VALID_STATUSES)

---

### Requirement: pr_events erzwingt eindeutige PR-Nummer und validen Status via Constraints
<!-- bats: tickets-pr-events.bats -->

The system SHALL maintain `tickets.pr_events` with columns `pr_number`, `title`, `category`, `merged_at`, `status`, reject duplicate `pr_number` via PRIMARY KEY, and reject invalid `status` values via a CHECK constraint.

#### Scenario: Tabelle existiert mit allen erwarteten Spalten *(BATS)*
- **GIVEN** `tickets.pr_events` wurde via `initTicketsSchema()` erstellt
- **WHEN** `information_schema.columns` abgefragt wird
- **THEN** sind `pr_number`, `title`, `category`, `merged_at` und `status` vorhanden

#### Scenario: Doppelte pr_number wird durch PRIMARY KEY abgelehnt *(BATS)*
- **GIVEN** ein Eintrag mit `pr_number = -99001` existiert bereits
- **WHEN** ein zweiter INSERT mit derselben `pr_number` versucht wird
- **THEN** schlägt der INSERT mit "duplicate" oder "unique"-Meldung fehl (Exit-Code ungleich 0)

#### Scenario: Ungültiger Status-Wert wird durch CHECK-Constraint abgelehnt *(BATS)*
- **GIVEN** `tickets.pr_events` hat ein CHECK-Constraint auf `status`
- **WHEN** ein INSERT mit `status = 'bogus'` versucht wird
- **THEN** schlägt der INSERT fehl (Exit-Code ungleich 0)

---

### Requirement: Migration projects→tickets erhält parent_id-Kette und ist idempotent
<!-- bats: tickets-projects-migration.bats -->

The system SHALL provide `migrate-projects-to-tickets.mjs` that maps `aktiv→in_progress`, preserves parent_id chains (sub_project parent is project, task parent is project/sub_project), creates a back-compat `public.projects` view, and is idempotent (no duplicates on second run).

#### Scenario: Dry-Run schreibt nichts in die Datenbank *(BATS)*
- **GIVEN** `migrate-projects-to-tickets.mjs` wird ohne `--apply` aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** bleibt die Anzahl der Zeilen in `tickets.tickets` gleich

#### Scenario: --apply migriert ein Projekt-Ticket korrekt *(BATS)*
- **GIVEN** ein neues `projects`-Eintrag mit Status `aktiv` existiert
- **WHEN** das Skript mit `--apply` ausgeführt wird
- **THEN** enthält `tickets.tickets` einen Eintrag mit `type='project'`, `status='in_progress'` und dem korrekten `title`

#### Scenario: Zweimaliges --apply erzeugt keine Duplikate *(BATS)*
- **GIVEN** das Migrationsskript wurde bereits einmal mit `--apply` ausgeführt
- **WHEN** es erneut mit `--apply` ausgeführt wird
- **THEN** bleibt die Anzahl der migrierten Zeilen gleich

#### Scenario: parent_id-Kette für Sub-Projekte und Tasks ist intakt *(BATS)*
- **GIVEN** Projekte, Sub-Projekte und Tasks wurden migriert
- **WHEN** die Eltern-Kind-Beziehungen in `tickets.tickets` geprüft werden
- **THEN** sind keine verwaisten Sub-Projekte oder Tasks vorhanden (0 orphan rows)

#### Scenario: Back-Compat-View public.projects hat alle erwarteten Spalten *(BATS)*
- **GIVEN** die Migration wurde ausgeführt
- **WHEN** `information_schema.columns` für `public.projects` abgefragt wird
- **THEN** sind alle Legacy-Spalten (`id`, `brand`, `name`, `description`, `status`, `priority`, etc.) vorhanden

#### Scenario: Status-Round-Trip: in_progress erscheint als 'aktiv' in der View *(BATS)*
- **GIVEN** ein Ticket mit `status='in_progress'` existiert in `tickets.tickets`
- **WHEN** `SELECT status FROM projects WHERE id=...` ausgeführt wird
- **THEN** gibt die View `aktiv` zurück

---

### Requirement: Reporter-Verlinkung ist idempotent und nutzt parameterisierte Queries
<!-- bats: tickets-reporter-link.bats -->

The system SHALL export `linkReporterByEmail` and `linkAllReporters`, use `$1` placeholders (no string interpolation), include the `t.reporter_id IS NULL` guard and `keycloak_user_id IS NOT NULL` filter in both functions, and set `reporter_id` correctly on matching records while returning `0` on subsequent calls.

#### Scenario: linkReporterByEmail setzt reporter_id bei passendem Customer *(BATS)*
- **GIVEN** ein Bug-Ticket mit `reporter_email='link-test@example.com'` und ein Customer mit passender Email und `keycloak_user_id` existieren
- **WHEN** `linkReporterByEmail('link-test@example.com')` aufgerufen wird
- **THEN** wird `reporter_id` auf die UUID des Customers gesetzt

#### Scenario: linkReporterByEmail gibt 0 zurück bei keinem passenden Customer *(BATS)*
- **GIVEN** kein Customer mit der gegebenen Email existiert
- **WHEN** `linkReporterByEmail('does-not-exist@example.com')` aufgerufen wird
- **THEN** gibt die Funktion `0` zurück

#### Scenario: linkAllReporters verlinkt alle unverbundenen Tickets im Batch *(BATS)*
- **GIVEN** ein Bug-Ticket mit `reporter_email='batch-test@example.com'` und passender Customer-Zeile existieren
- **WHEN** `linkAllReporters()` aufgerufen wird
- **THEN** gibt die Funktion mindestens `1` zurück und das Ticket hat danach `reporter_id` gesetzt

#### Scenario: linkReporterByEmail ist idempotent (zweiter Aufruf gibt 0) *(BATS)*
- **GIVEN** `reporter_id` wurde bereits beim ersten Aufruf gesetzt
- **WHEN** `linkReporterByEmail(...)` erneut aufgerufen wird
- **THEN** gibt die Funktion `0` zurück (WHERE `t.reporter_id IS NULL` schlägt fehl)

#### Scenario: Beide Funktionen verwenden parameterisierte Queries *(BATS)*
- **GIVEN** `reporter-link.ts` enthält beide Funktionen
- **WHEN** der Code auf String-Interpolation geprüft wird
- **THEN** verwenden beide Funktionen `$1`-Platzhalter; `t.reporter_id IS NULL` und `keycloak_user_id IS NOT NULL` kommen jeweils zweimal vor

---

### Requirement: tickets-sunset.mjs ist idempotent, schreibt Dry-Run als Default und erkennt Objekt-Typ via relkind
<!-- bats: tickets-sunset.bats -->

The system SHALL provide `tickets-sunset.mjs` that uses `IF EXISTS` in all DROP statements, requires `--apply` for destructive operations, reads `relkind` from `pg_class` to choose TABLE vs. VIEW, and after execution SHALL have removed all legacy schema objects while leaving `tickets.tickets` as a base table.

#### Scenario: Sunset-Skript ist idempotent (IF EXISTS) und hat Dry-Run-Guard *(BATS)*
- **GIVEN** `scripts/tickets-sunset.mjs` existiert
- **WHEN** die Datei auf Idempotenz- und Guard-Muster geprüft wird
- **THEN** enthält das Skript `IF EXISTS`, `process.argv.includes('--apply')` und liest `relkind` aus `pg_class`

#### Scenario: Legacy-Objekte sind nach --apply entfernt *(BATS)*
- **GIVEN** das Sunset-Skript wurde mit `--apply` ausgeführt
- **WHEN** `pg_class` auf die Legacy-Objekte geprüft wird
- **THEN** sind `bugs.bug_tickets`, `bachelorprojekt.requirements`, `bachelorprojekt.features`, `bachelorprojekt.v_timeline`, `public.projects`, `public.sub_projects`, `public.project_tasks` nicht mehr vorhanden

#### Scenario: tickets.tickets ist danach eine Base Table *(BATS)*
- **GIVEN** das Sunset-Skript wurde ausgeführt
- **WHEN** `pg_class.relkind` für `tickets.tickets` abgefragt wird
- **THEN** ist `relkind = 'r'` (ordinary table, nicht view)

---

### Requirement: Migration tracking→tickets migriert Requirements und Feature-Links idempotent
<!-- bats: tickets-tracking-migration.bats -->

The system SHALL provide `migrate-tracking-to-tickets.mjs` that in dry-run makes no changes, on `--apply` migrates `bachelorprojekt.requirements` as `type='feature'` tickets with `thesis_tag`, is idempotent on second run, preserves the `v_timeline` column shape, and creates `ticket_links` rows for features with `requirement_id`.

#### Scenario: Dry-Run schreibt keine Zeilen in tickets.pr_events *(BATS)*
- **GIVEN** `migrate-tracking-to-tickets.mjs` wird ohne `--apply` aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** bleibt `SELECT COUNT(*) FROM tickets.pr_events` gleich

#### Scenario: --apply migriert eine Requirement-Zeile korrekt *(BATS)*
- **GIVEN** eine Zeile in `bachelorprojekt.requirements` mit `category='FA'` und `name='Migration test req'` existiert
- **WHEN** das Skript mit `--apply` ausgeführt wird
- **THEN** enthält `tickets.tickets` einen Eintrag mit `type='feature'`, `thesis_tag=external_id` und dem korrekten Titel

#### Scenario: Zweimaliges --apply erzeugt keine Duplikate *(BATS)*
- **GIVEN** das Migrationsskript wurde bereits einmal mit `--apply` ausgeführt
- **WHEN** es erneut mit `--apply` ausgeführt wird
- **THEN** gibt es für jede external_id genau eine Zeile in `tickets.tickets`

#### Scenario: v_timeline behält alle erforderlichen Spalten *(BATS)*
- **GIVEN** die Migration hat die v_timeline-View erstellt
- **WHEN** `information_schema.columns` abgefragt wird
- **THEN** sind `id`, `day`, `merged_at`, `pr_number`, `title`, `description`, `category`, `scope`, `brand`, `requirement_id`, `requirement_name` alle vorhanden

#### Scenario: ticket_links-Zeile wird für Feature mit requirement_id erstellt *(BATS)*
- **GIVEN** ein `bachelorprojekt.features`-Eintrag hat eine `requirement_id`
- **WHEN** das Migrationsskript mit `--apply` ausgeführt wird
- **THEN** existiert in `tickets.ticket_links` ein Eintrag mit `kind='fixes'` und dem passenden `pr_number`

---

### Requirement: transitionTicket validiert Status/Resolution und führt Übergänge atomar aus
<!-- bats: tickets-transition.bats -->

The system SHALL export `transitionTicket`, `TicketStatus`, `TicketResolution`, and `TransitionResult`; reject unknown statuses and `done`/`archived` without resolution; use `pool.connect()` with explicit BEGIN/COMMIT/ROLLBACK; set `app.user_label` and `app.user_id` session config; set `started_at` on first `in_progress`, `done_at` on `done`; create `ticket_links` for `prNumber`; insert `ticket_activity` with `field='_updated'`; and return a `TransitionResult` with all required fields.

#### Scenario: Statische Struktur: alle Exports und Transaktionsmuster vorhanden *(BATS)*
- **GIVEN** `website/src/lib/tickets/transition.ts` existiert
- **WHEN** die Datei auf Exports und SQL-Muster geprüft wird
- **THEN** exportiert sie `transitionTicket`, `TicketStatus`, `TicketResolution`, `TransitionResult`; enthält `pool.connect()`, `BEGIN`, `COMMIT`, `ROLLBACK`, `app.user_label`, `app.user_id` und `before.status !== 'done'`

#### Scenario: Unbekannter Status wird abgelehnt *(BATS)*
- **GIVEN** `transitionTicket` wird mit `status: 'banana'` aufgerufen
- **WHEN** die Funktion den Status validiert
- **THEN** rejected das Promise mit einem Fehler, der "invalid status" enthält

#### Scenario: done und archived ohne Resolution werden abgelehnt *(BATS)*
- **GIVEN** `transitionTicket` wird mit `status: 'done'` oder `status: 'archived'` ohne `resolution` aufgerufen
- **WHEN** die Funktion validiert
- **THEN** rejected das Promise mit einem Fehler, der "resolution" enthält

#### Scenario: done setzt resolution und done_at in der DB *(BATS)*
- **GIVEN** ein Ticket ist im Status `triage`
- **WHEN** `transitionTicket` mit `status: 'done', resolution: 'fixed'` aufgerufen wird
- **THEN** enthält das Ticket danach `status='done'`, `resolution='fixed'` und ein gesetztes `done_at`

#### Scenario: in_progress setzt started_at *(BATS)*
- **GIVEN** ein Ticket ist im Status `backlog`
- **WHEN** `transitionTicket` mit `status: 'in_progress'` aufgerufen wird
- **THEN** ist `started_at` in der Datenbank gesetzt

#### Scenario: note-Parameter wird als status_change-Kommentar gespeichert *(BATS)*
- **GIVEN** `transitionTicket` wird mit `note: 'shipped in v1.2', noteVisibility: 'internal'` aufgerufen
- **WHEN** die Transaktion abgeschlossen wird
- **THEN** existiert genau ein Kommentar mit `kind='status_change'` und `body='shipped in v1.2'` für das Ticket

#### Scenario: prNumber erstellt ticket_links mit kind='fixes' *(BATS)*
- **GIVEN** `transitionTicket` wird mit `prNumber: 42` aufgerufen
- **WHEN** die Transaktion abgeschlossen wird
- **THEN** enthält `tickets.ticket_links` einen Eintrag mit `kind='fixes'` und `pr_number=42`; ein zweiter Aufruf mit derselben pr_number erzeugt keine Duplikate

#### Scenario: Audit-Log-Eintrag wird bei jedem Übergang geschrieben *(BATS)*
- **GIVEN** ein Ticket-Übergang wird durchgeführt
- **WHEN** die Transaktion abgeschlossen wird
- **THEN** enthält `tickets.ticket_activity` mindestens einen Eintrag mit `field='_updated'` für das Ticket

#### Scenario: TransitionResult enthält alle Pflichtfelder *(BATS)*
- **GIVEN** `transitionTicket` wird mit `status: 'done', resolution: 'wontfix'` aufgerufen
- **WHEN** die Funktion das Ergebnis zurückgibt
- **THEN** enthält das Objekt `id`, `externalId`, `type`, `status` (='done'), `resolution` (='wontfix') und `emailSent`

---

### Requirement: vda.sh und ticket.sh CLI leiten Subcommands korrekt weiter und validieren Argumente
<!-- bats: vda-ticket-smoke.bats -->

The system SHALL provide `vda/ticket.sh` that exits 0 for `help`, exits 2 for missing required parameters, exits 1 with "Unknown command" for unknown subcommands; `vda.sh` SHALL list `oracle`, `promote`, `ticket`, `factory-prep` in its help output and handle `promote` flags correctly.

#### Scenario: ticket help gibt 0 zurück und listet Subcommands *(BATS)*
- **GIVEN** `scripts/vda/ticket.sh help` wird aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** beendet es sich mit Exit-Code 0 und die Ausgabe enthält "subcommands" und "triage"

#### Scenario: Fehlende Pflichtparameter geben Exit 2 zurück *(BATS)*
- **GIVEN** `vda/ticket.sh create` oder `vda/ticket.sh get` ohne `--id` wird aufgerufen
- **WHEN** das Skript die Argumente prüft
- **THEN** beendet es sich jeweils mit Exit-Code 2

#### Scenario: Unbekannter Subcommand gibt Exit 1 mit Fehlermeldung *(BATS)*
- **GIVEN** `vda/ticket.sh nonexistent` wird aufgerufen
- **WHEN** das Skript den Subcommand nicht findet
- **THEN** beendet es sich mit Exit-Code 1 und gibt "Unknown command" aus

#### Scenario: vda.sh help listet alle Hauptcommands *(BATS)*
- **GIVEN** `scripts/vda.sh help` wird aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** enthält die Ausgabe `oracle`, `promote`, `ticket` und `factory-prep`

#### Scenario: vda.sh promote --help gibt 0 zurück *(BATS)*
- **GIVEN** `scripts/vda.sh promote --help` wird aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** beendet es sich mit Exit-Code 0 und die Ausgabe enthält "promote"

#### Scenario: vda.sh promote mit ungültigem Flag gibt Exit 2 *(BATS)*
- **GIVEN** `scripts/vda.sh promote --bad-flag` wird aufgerufen
- **WHEN** das Skript den Flag nicht kennt
- **THEN** beendet es sich mit Exit-Code 2 und gibt "Unknown option" aus

#### Scenario: vda.sh ticket feature-flag ohne --brand gibt Fehlermeldung *(BATS)*
- **GIVEN** `scripts/vda.sh ticket feature-flag get` ohne `--brand` wird aufgerufen
- **WHEN** das Skript die Argumente prüft
- **THEN** enthält die Ausgabe "--brand is required" oder "ERROR"

---

### Requirement: Admin-Ticket-Workflow: Filter, Kommentar, Transition und Timeline
<!-- e2e: fa-admin-tickets.spec.ts -->

The system SHALL allow an authenticated admin to filter the ticket index by type and status, open a ticket detail page, post internal and public comments, transition a ticket to `done` with a resolution, and show the activity timeline reflecting all events; the public comment SHALL trigger a reporter email visible in Mailpit.

#### Scenario: Vollständiger Admin-Ticket-Workflow (Filter + Kommentar + Transition + Timeline) *(E2E)*
- **GIVEN** ein Admin ist mit gültigen Credentials eingeloggt und ein Bug-Ticket existiert mit einer Reporter-Email
- **WHEN** der Admin den Index filtert, das Ticket öffnet, einen internen und einen öffentlichen Kommentar postet und das Ticket auf `done` mit `resolution=fixed` transitioniert
- **THEN** ist das Ticket in der gefilterten Liste sichtbar, die Kommentare wurden gespeichert, der öffentliche Kommentar triggert eine Reporter-Email in Mailpit und die Activity-Timeline zeigt alle Ereignisse

---

### Requirement: Ticket-Widget im Portal zeigt "Fehler melden" und Admin-Layout hat kein schwebendes Widget
<!-- e2e: fa-43-ticket-widget.spec.ts -->

The system SHALL require authentication for `/portal`, return 403 for unauthenticated `/api/admin/tickets` calls, render a floating `button[aria-label="Fehler melden"]` in the portal layout, attach the `TicketWidgetBar` component in the DOM, omit the floating button in the admin layout (showCreate=false), and render the ticket create form in the PlatformHub Tickets tab.

#### Scenario: /portal erfordert Authentifizierung *(E2E)*
- **GIVEN** ein nicht-authentifizierter Benutzer ruft `/portal` auf
- **WHEN** die Seite lädt
- **THEN** wird der Benutzer umgeleitet (URL ist nicht mehr `/portal`)

#### Scenario: GET /api/admin/tickets gibt 403 ohne Auth *(E2E)*
- **GIVEN** ein nicht-authentifizierter Request trifft `/api/admin/tickets`
- **WHEN** der Endpoint die Auth prüft
- **THEN** wird HTTP 403 zurückgegeben

#### Scenario: Portal zeigt schwebendes "Fehler melden"-Widget *(E2E)*
- **GIVEN** ein authentifizierter Benutzer ist im Portal eingeloggt
- **WHEN** `/portal` geladen wird
- **THEN** ist `button[aria-label="Fehler melden"]` sichtbar (schwebendes Widget unten rechts)

#### Scenario: TicketWidgetBar ist im DOM vorhanden *(E2E)*
- **GIVEN** ein authentifizierter Benutzer ist im Portal
- **WHEN** die Seite vollständig geladen ist
- **THEN** ist `.fixed.bottom-6.right-6` im DOM angebunden (`toBeAttached`)

#### Scenario: Admin-Layout hat kein schwebendes "Fehler melden"-Widget *(E2E)*
- **GIVEN** ein authentifizierter Admin ist unter `/admin` eingeloggt
- **WHEN** die Seite geladen wird
- **THEN** gibt es 0 Elemente mit `button[aria-label="Fehler melden"]` (showCreate=false in AdminLayout)

---

### Requirement: Bug-Report-API validiert Eingaben und erstellt Tickets mit korrektem Format
<!-- e2e: fa-26-bug-report-form.spec.ts -->

The system SHALL return HTTP 400 for `POST /api/bug-report` with missing description, invalid email, invalid category, or description exceeding 2000 characters; for valid input with `CRON_SECRET` SHALL return 200 with `{ success: true, ticketId: /^T\d+$/ }`; and `GET /api/status?id=T000001` SHALL respond with a JSON object with status 200 or 404.

#### Scenario: POST ohne description gibt 400 zurück *(E2E)*
- **GIVEN** ein Request an `POST /api/bug-report` ohne `description`-Feld
- **WHEN** der Endpoint die Eingabe validiert
- **THEN** wird HTTP 400 mit einem `{ error: ... }`-Body zurückgegeben

#### Scenario: POST mit ungültiger Email gibt 400 zurück *(E2E)*
- **GIVEN** ein Request mit `email: 'not-an-email'`
- **WHEN** der Endpoint die Email validiert
- **THEN** wird HTTP 400 mit einem `{ error: ... }`-Body zurückgegeben

#### Scenario: POST mit ungültiger Kategorie gibt 400 zurück *(E2E)*
- **GIVEN** ein Request mit `category: 'ungueltig'`
- **WHEN** der Endpoint die Kategorie prüft
- **THEN** wird HTTP 400 mit einem `{ error: ... }`-Body zurückgegeben

#### Scenario: POST mit zu langer description gibt 400 zurück *(E2E)*
- **GIVEN** ein Request mit einer `description` von mehr als 2000 Zeichen
- **WHEN** der Endpoint die Länge prüft
- **THEN** wird HTTP 400 zurückgegeben

#### Scenario: POST mit validen Daten erstellt ein Ticket (T-Format ID) *(E2E)*
- **GIVEN** ein Request mit gültiger `description`, `email`, `category` und `url` sowie gesetztem `CRON_SECRET`
- **WHEN** `POST /api/bug-report` ausgeführt wird
- **THEN** wird HTTP 200 mit `{ success: true, ticketId: /^T\d+$/ }` zurückgegeben

#### Scenario: GET /api/status mit T-Format ID antwortet korrekt *(E2E)*
- **GIVEN** `GET /api/status?id=T000001` wird aufgerufen
- **WHEN** der Endpoint die Anfrage verarbeitet
- **THEN** gibt er HTTP 200 oder 404 mit einem JSON-Objekt zurück

<!-- merged from change delta ticket-system.md on 2026-07-01 -->

<!-- consolidated from micro-spec ai-ticket-auto-triage [T002014] -->

### Requirement: Automatic-Severity-Triage

The system SHALL automatically evaluate ticket severity at create time using a heuristic rule set (keyword-matching + area-weighting) and apply the result based on confidence level.

#### Scenario: Auto-Apply bei hoher Confidence

- **GIVEN** ein neues Ticket wird angelegt mit Beschreibung die "prod-down" enthält
- **WHEN** heuristik.mjs analysiert das Ticket
- **THEN** wird bei Confidence >90% das Severity-Feld direkt gesetzt (auto-apply)

#### Scenario: Vorschlag-Comment bei mittlerer Confidence

- **GIVEN** ein neues Ticket wird angelegt mit mehrdeutigem Inhalt
- **WHEN** heuristik.mjs analysiert das Ticket
- **THEN** wird bei Confidence 50-90% ein Comment „Vorgeschlagene Severity: X" hinzugefügt

#### Scenario: Keine Aktion bei niedriger Confidence

- **GIVEN** ein neues Ticket ohne Beschreibung wird angelegt
- **WHEN** heuristik.mjs analysiert das Ticket
- **THEN** wird bei Confidence <50% keine Aktion ausgeführt

<!-- consolidated from micro-spec decouple-tickets-db [T002014] -->

### Requirement: S2 import cycle between `tickets-db.ts` and `website-db.ts` is removed

The system SHALL break the static import cycle `lib/tickets-db.ts ↔ lib/website-db.ts`
(G-CQ07 cycle #1) so that `npx --yes madge --circular --extensions ts,tsx website/src`
no longer reports that cycle. The other three S2 cycles (transitions / reporter-link /
invoice-pdf ↔ native-billing) SHALL remain untouched by this change and SHALL be
addressed in separate follow-up PRs.

#### Scenario: S2 cycle #1 is absent from `madge --circular` output

- **GIVEN** the workspace contains the four import cycles G-CQ07 enumerates
  (`tickets-db ↔ website-db`, two `tickets/transition` cycles, `invoice-pdf ↔ native-billing`)
- **WHEN** the implementer runs `npx --yes madge --circular --extensions ts,tsx website/src`
  on the merged branch
- **THEN** the output reports exactly the three remaining cycles
  (`lib/website-db.ts > lib/tickets/transition.ts > lib/tickets/reporter-link.ts`,
  the duplicate `lib/website-db.ts > lib/tickets/transition.ts` listing, and
  `lib/invoice-pdf.ts > lib/native-billing.ts`) and the cycle between
  `lib/tickets-db.ts` and `lib/website-db.ts` is absent.

### Requirement: Public API of `tickets-db.ts` is preserved

The system SHALL keep the four public exports of `tickets-db.ts` (re-export of
`MixedEmbeddingModelError`, `ticketEmbeddingModel`, `initTicketsSchema`,
`isFeatureEnabled`) importable via the same module path with identical
signatures, so that no caller outside the three refactor files needs to
change its import statement.

#### Scenario: Existing `import { initTicketsSchema } from './tickets-db'` lines still work

- **GIVEN** call-sites such as `tickets/admin.ts`, `tickets-embed.ts`,
  `systemtest/failure-bridge.ts`, `systemtest/test-run-bridge.ts` and the
  seven test files that import from `./tickets-db`
- **WHEN** the refactor lands on the merged branch
- **THEN** each of those import statements still resolves to a binding of
  the same name and identical signature, and TypeScript reports no
  `TS2305`/`TS2614` errors.

### Requirement: `tickets-db.ts` line count does not grow

The system SHALL ensure that the resulting `tickets-db.ts` has fewer lines
than the baselined 1096 (frozen at commit `8b581ebe` per
`docs/code-quality/baseline.json`), so that the S1-Ratchet
(`task test:code-quality`) does not trip on the baselined file.

#### Scenario: `wc -l` of `tickets-db.ts` is below the baseline

- **GIVEN** the current `tickets-db.ts` is 1096 lines, baselined at 1096
- **WHEN** the implementer runs `wc -l website/src/lib/tickets-db.ts`
  on the merged branch
- **THEN** the reported line count is strictly less than 1096.

<!-- merged from change delta ticket-system.md (f9a918942754) -->