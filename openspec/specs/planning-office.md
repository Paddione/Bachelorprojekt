# planning-office
<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Planning-Office-Domain steuert den LLM-gestützten Klärungsprozess für Ticket-Items im Planungsbüro: Generierung von Klärungsfragen anhand des Definition-of-Ready-Status, JSONB-basiertes Merging von Readiness-Flags direkt in der Datenbank, Berechnung von Liefermetriken (Durchlaufzeiten nach Stage) sowie die Zustandsermittlung des Kunden-Workflows (Fragebogen, Verträge, Buchungen). Zusätzlich umfasst das Domain das CRM-Schema für Kundenverwaltung (Kontakthistorie, Profilvalidierung) und die Verwaltung von Ordnervorlagen-Strukturen für die Nextcloud-Kundenmappen.

---

## Requirements

### Requirement: clarifyItem Returns False for Unknown Ticket

The system SHALL return `false` from `clarifyItem` when no ticket matching the given external ID exists in the database.

#### Scenario: Ticket nicht gefunden

- **GIVEN** kein Ticket mit der ID `T999999` existiert in der Datenbank
- **WHEN** `clarifyItem('T999999', '## body', {}, {})` aufgerufen wird
- **THEN** der Rückgabewert ist `false`

---

### Requirement: clarifyItem Inserts Comment with planning-office Author

The system SHALL insert a ticket comment attributed to the `planning-office` author label, containing the provided Markdown body and referencing the resolved ticket UUID.

#### Scenario: Klärungskommentar wird eingefügt

- **GIVEN** ein Ticket `T000571` existiert und wird per `SELECT id` auf `uuid-1` aufgelöst
- **WHEN** `clarifyItem('T000571', '## Klärungsrunde\n| a | b |', {}, {})` aufgerufen wird
- **THEN** ein `INSERT INTO tickets.ticket_comments` mit den Parametern `['uuid-1', '## Klärungsrunde\n| a | b |']` wird ausgeführt

#### Scenario: Kein Update bei leerem readinessUpdates

- **GIVEN** ein Ticket `T000571` existiert
- **WHEN** `clarifyItem('T000571', 'b', {}, {})` mit leerem `readinessUpdates`-Objekt aufgerufen wird
- **THEN** kein `SET readiness = readiness ||`-Statement wird ausgeführt

---

### Requirement: clarifyItem Merges Readiness Flags via JSONB

The system SHALL perform a JSONB merge (`readiness = readiness || $1`) when `readinessUpdates` is non-empty, and SHALL update optional fields `depends_on` and `effort` when provided via `opts`.

#### Scenario: JSONB-Merge bei nicht-leerem readinessUpdates

- **GIVEN** ein Ticket `T000571` existiert
- **WHEN** `clarifyItem('T000571', 'b', { abhaengigkeiten_klar: true, offene_fragen_geklaert: true }, {})` aufgerufen wird
- **THEN** ein SQL-Statement mit `SET readiness = readiness ||` wird ausgeführt und der erste Parameter enthält `{ abhaengigkeiten_klar: true, offene_fragen_geklaert: true }` als JSON

#### Scenario: Optionale Felder depends_on und effort werden gesetzt

- **GIVEN** ein Ticket `T000571` existiert
- **WHEN** `clarifyItem('T000571', 'b', {}, { dependsOn: ['T000573'], effort: 'klein' })` aufgerufen wird
- **THEN** ein `SET depends_on =`-Statement mit `['T000573']` und ein `SET effort =`-Statement mit `'klein'` werden ausgeführt

---

### Requirement: Clarification Question Sections Derived from DoR Readiness

The system SHALL derive clarification question sections only for unresolved DoR flags, returning an empty list when all flags are `true`, and producing per-area sections for `offene_fragen_geklaert` when areas are set.

#### Scenario: Keine Sektionen wenn alle DoR-Flags gesetzt

- **GIVEN** ein Item mit `readiness: { spec_skizziert: true, offene_fragen_geklaert: true, abhaengigkeiten_klar: true, aufwand_geschaetzt: true }`
- **WHEN** `deriveSections(item)` aufgerufen wird
- **THEN** das Ergebnis ist eine leere Liste

#### Scenario: Eine Sektion pro Area bei ungesetztem offene_fragen_geklaert

- **GIVEN** ein Item mit `readiness: { offene_fragen_geklaert: false }` und `areas: ['brett', 'website']`
- **WHEN** `deriveSections(item)` aufgerufen wird
- **THEN** genau zwei Sektionen mit `dorFlag === 'offene_fragen_geklaert'` werden zurückgegeben, die erste enthält `'brett'` im Titel; bei fehlendem `areas`-Array wird eine generische Fallback-Sektion erzeugt

---

### Requirement: Clarification Question Sections Field Types per DoR Flag

The system SHALL produce typed form fields for each DoR section: `abhaengigkeiten_klar` generates one text and one radio field, `spec_skizziert` generates two text fields, and `aufwand_geschaetzt` generates one radio field with options `['klein', 'mittel', 'gross']`.

#### Scenario: Abhängigkeiten-Sektion hat zwei Felder (text + radio)

- **GIVEN** ein Item mit `readiness: { abhaengigkeiten_klar: false }`
- **WHEN** `deriveSections(item)` aufgerufen wird
- **THEN** die Sektion mit `dorFlag === 'abhaengigkeiten_klar'` enthält genau 2 Felder: erstes vom Typ `'text'`, zweites vom Typ `'radio'`

#### Scenario: Aufwand-Sektion hat ein Radio-Feld mit den drei Optionen

- **GIVEN** ein Item mit `readiness: { aufwand_geschaetzt: false }`
- **WHEN** `deriveSections(item)` aufgerufen wird
- **THEN** die Sektion mit `dorFlag === 'aufwand_geschaetzt'` enthält genau 1 Feld vom Typ `'radio'` mit `options: ['klein', 'mittel', 'gross']`

---

### Requirement: Clarification Comment Body Rendered as Markdown Table

The system SHALL render answers as a Markdown table under a dated `## Klärungsrunde`-Heading and SHALL skip empty or blank answers.

#### Scenario: Antworten als Markdown-Tabelle mit Feldlabels

- **GIVEN** Antworten `{ abhaengigkeiten: 'T000573', brett_rollen: ['leiter', 'teilnehmer'] }` mit Labels und Datum `'2026-06-10'`
- **WHEN** `buildCommentBody(answers, labels, date)` aufgerufen wird
- **THEN** der Rückgabewert enthält `'## Klärungsrunde 2026-06-10'`, `'| Welche Tickets müssen vorher fertig sein? | T000573 |'` und Arrays werden kommasepariert dargestellt

#### Scenario: Leere Antworten werden übersprungen

- **GIVEN** Antworten `{ a: '', b: [], c: 'x' }` mit Labels `{ a: 'A?', b: 'B?', c: 'C?' }` und Datum `'2026-06-10'`
- **WHEN** `buildCommentBody(answers, labels, date)` aufgerufen wird
- **THEN** der Rückgabewert enthält weder `'A?'` noch `'B?'`, jedoch `'| C? | x |'`

---

### Requirement: Delivery Metrics Duration Calculation

The system SHALL calculate stage durations in hours between ISO timestamps and SHALL return `null` for any stage where either boundary timestamp is absent.

#### Scenario: Korrekte Stundenberechnung bei vollständigen Zeitstempeln

- **GIVEN** `from = '2026-06-14T10:00:00Z'` und `to = '2026-06-14T16:30:00Z'`
- **WHEN** `calcDurationH(from, to)` aufgerufen wird
- **THEN** der Rückgabewert ist `6.5`

#### Scenario: Null bei fehlendem Zeitstempel

- **GIVEN** `from = null` oder `to = null`
- **WHEN** `calcDurationH(from, to)` aufgerufen wird
- **THEN** der Rückgabewert ist `null`

---

### Requirement: Delivery Metrics Full Pipeline Metric Aggregation

The system SHALL compute `hoursTicketToPrOpen`, `hoursPrOpenToMerged`, `hoursMergedToLive`, and `hoursTotal` for a complete delivery row, and SHALL return `null` for all four fields when intermediate timestamps are missing.

#### Scenario: Alle Felder bei vollständigen Daten berechnet

- **GIVEN** eine `DeliveryRow` mit `ticket_created_at`, `pr_opened_at`, `merged_at`, `done_at` und einem `now`-Zeitstempel
- **WHEN** `toDeliveryMetric(row, now, repo)` aufgerufen wird
- **THEN** `hoursTicketToPrOpen = 26`, `hoursPrOpenToMerged = 76`, `hoursMergedToLive = 4` und `hoursTotal = 106`; `ticketUrl` zeigt auf `/admin/tickets/T000500` und `prUrl` auf `https://github.com/<repo>/pull/123`

#### Scenario: Null-Felder bei fehlenden Zwischenzeitstempeln

- **GIVEN** eine `DeliveryRow` mit `pr_opened_at = null` und `merged_at = null`
- **WHEN** `toDeliveryMetric(row, null, repo)` aufgerufen wird
- **THEN** alle vier Stunden-Felder sind `null`

---

### Requirement: Delivery Summary Averages and Mishap Rate

The system SHALL compute averages for all four duration fields by ignoring null entries, calculate a mishap rate as `bugCount / deliveries`, and return `throughputPerWeek = 0` with `mishapRate = null` when the delivery list is empty.

#### Scenario: Durchschnittswerte ignorieren null-Einträge

- **GIVEN** drei Metriken, von denen eine komplett null ist
- **WHEN** `summarize(metrics, bugCount, days, models)` aufgerufen wird
- **THEN** `avgHoursTicketToPrOpen = 20`, `avgHoursPrOpenToMerged = 30`, `avgHoursMergedToLive = 7.5`, `avgHoursTotal = 57.5`

#### Scenario: Mishap-Rate und leere Delivery-Liste

- **GIVEN** zwei Deliveries und `bugCount = 1`
- **WHEN** `summarize(metrics, 1, 7, {})` aufgerufen wird
- **THEN** `mishapRate = 0.5` und `mishapCount = 1`; bei leerer Liste ist `throughputPerWeek = 0` und `mishapRate = null`

---

### Requirement: Workflow Status Track Aggregation

The system SHALL build exactly three workflow tracks (`fragebogen`, `vertraege`, `buchung`) in stable order, each with label, emoji, status string, `stage.{current,total}`, and an `href` starting with `/portal?section=`.

#### Scenario: Drei Tracks in stabiler Reihenfolge

- **GIVEN** `WorkflowSources` mit gemischten Fragebogen-Assignments, offenen Signaturen und zukünftiger Buchung
- **WHEN** `buildWorkflowTracks(sources)` aufgerufen wird
- **THEN** das Ergebnis hat genau drei Tracks mit keys `['fragebogen', 'vertraege', 'buchung']`, jeder Track hat ein nicht-leeres `label`, `emoji`, `status`, gültige `stage.current`/`stage.total` und ein `href` der Form `/portal?section=…`

#### Scenario: Resilienz bei fehlenden Quelldaten

- **GIVEN** `WorkflowSources` mit `undefined` für `questionnaires`, `pendingSignatures` und `bookings`
- **WHEN** `buildWorkflowTracks(sources)` aufgerufen wird
- **THEN** kein Fehler wird geworfen und es werden genau drei Tracks zurückgegeben

---

### Requirement: Workflow Track Status Transitions

The system SHALL set track status to `'offen'` while work is actionable, `'erledigt'` when all items are in a terminal state, `'leer'` when no data exists, and `'geplant'` when future bookings are confirmed; cancelled future bookings SHALL NOT count as upcoming.

#### Scenario: Fragebogen-Track-Status-Übergänge

- **GIVEN** Assignments im Status `['in_progress', 'submitted', 'archived']`
- **WHEN** `buildWorkflowTracks(sources)` ausgewertet wird
- **THEN** der `fragebogen`-Track hat `status = 'offen'` und `stage.current = 2`; mit nur terminalen Assignments (`reviewed`, `archived`) ist `status = 'erledigt'`; ohne Assignments ist `status = 'leer'`

#### Scenario: Buchungs-Track ignoriert stornierte und vergangene Termine

- **GIVEN** nur eine zukünftige Buchung mit `status = 'CANCELLED'`
- **WHEN** `buildWorkflowTracks(sources)` ausgewertet wird
- **THEN** der `buchung`-Track hat `status = 'leer'` (keine gültige Upcoming-Buchung)

---

### Requirement: Workflow Status Graceful Degradation on Source Failure

The system SHALL resolve all three tracks even when a single data source throws, degrading the failed source to an empty list without propagating the error.

#### Scenario: Einzelner Quellen-Fehler führt nicht zum Abbruch

- **GIVEN** `listQAssignmentsForCustomer` wirft `Error('db down')`
- **WHEN** `getWorkflowStatus(session, deps)` aufgerufen wird
- **THEN** drei Tracks werden zurückgegeben; der `fragebogen`-Track hat `status = 'leer'`

#### Scenario: Kein Kundendatensatz — Buchungen werden trotzdem aufgelöst

- **GIVEN** `getCustomerByEmail` liefert `null`
- **WHEN** `getWorkflowStatus(session, deps)` aufgerufen wird
- **THEN** `fragebogen` hat `status = 'leer'`, `vertraege` hat `status = 'erledigt'` und `buchung` hat `status = 'geplant'`

---

### Requirement: CRM Profile Validation and Enum Constraints

The system SHALL expose fixed enum sets for `CONTACT_CHANNELS`, `COMM_FREQUENCIES`, `CUSTOMER_STATUSES`, and `CONTACT_TYPES`, and SHALL reject profile updates with an invalid channel or an overly long phone number (>30 chars) while accepting valid partial or empty payloads.

#### Scenario: Ungültige Profilfelder werden abgelehnt

- **GIVEN** ein Payload mit `phone: 'x'.repeat(31)` oder `preferred_contact_channel: 'fax'`
- **WHEN** `validateProfileInput(payload)` aufgerufen wird
- **THEN** `result.ok` ist `false`

#### Scenario: Valide und leere Payloads werden akzeptiert

- **GIVEN** ein Payload `{ phone: '+49 30 123', communication_frequency: 'monatlich' }` oder `{}`
- **WHEN** `validateProfileInput(payload)` aufgerufen wird
- **THEN** `result.ok` ist `true`

---

### Requirement: CRM Schema Idempotent Migration

The system SHALL apply idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) via `ensureCustomerCrmSchema` to add address, customer_status, tags columns and the `customer_contact_history` table with its index.

#### Scenario: Schema-Migration ist idempotent

- **GIVEN** die Datenbank ist erreichbar
- **WHEN** `ensureCustomerCrmSchema()` aufgerufen wird
- **THEN** die ausgeführten SQL-Statements enthalten `ADD COLUMN IF NOT EXISTS address`, `ADD COLUMN IF NOT EXISTS customer_status`, `ADD COLUMN IF NOT EXISTS tags TEXT[]`, `CREATE TABLE IF NOT EXISTS customer_contact_history` und den Index `idx_customer_contact_history_user`

---

### Requirement: Folder Template Structure Validation

The system SHALL define a default template of exactly 5 ordered folders (`01_Vertrag`, `02_Rechnungen`, `03_Dokumente`, `04_Assets`, `05_Kommunikation`) and SHALL reject folder structures that are non-arrays, empty, contain path traversal sequences (`..`), leading slashes, blank names, unallowed characters, segments longer than 100 characters, duplicates, or exceed `MAX_FOLDERS`.

#### Scenario: Standard-Ordnervorlage hat 5 Einträge in korrekter Reihenfolge

- **GIVEN** die exportierte Konstante `DEFAULT_FOLDERS`
- **WHEN** deren Inhalt geprüft wird
- **THEN** sie enthält genau 5 Einträge in der Reihenfolge `['01_Vertrag', '02_Rechnungen', '03_Dokumente', '04_Assets', '05_Kommunikation']`

#### Scenario: Ungültige Strukturen werden abgelehnt

- **GIVEN** Eingaben wie `'..'`, `'/etc'`, `'foo/../bar'`, `['foo*bar']`, doppelte Einträge, ein leeres Array oder ein Array mit zu vielen Ordnern
- **WHEN** `validateStructure(input)` aufgerufen wird
- **THEN** `result.ok` ist `false`; verschachtelte Pfade mit `/` und Einträge bis zur Grenze von `MAX_FOLDERS` werden als gültig akzeptiert

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: plan-meta CLI Argument Validation
<!-- bats: planning-office.bats -->

The system SHALL validate subcommands and required flags for `ticket.sh plan-meta` before any database access, returning a non-zero exit code and a descriptive error message on invalid input.

#### Scenario: plan-meta requires a subaction *(BATS)*
- **GIVEN** das Skript `ticket.sh` wird mit dem Subkommando `plan-meta` ohne weitere Argumente aufgerufen
- **WHEN** `bash ticket.sh plan-meta` ausgeführt wird
- **THEN** Exit-Code ist ungleich 0 und der Output enthält `"set|get"`

#### Scenario: plan-meta set rejects missing --id *(BATS)*
- **GIVEN** `plan-meta set` wird ohne `--id`-Flag aufgerufen
- **WHEN** `bash ticket.sh plan-meta set --effort klein` ausgeführt wird
- **THEN** Exit-Code ist ungleich 0 und der Output enthält `"--id"`

#### Scenario: plan-meta set rejects invalid effort *(BATS)*
- **GIVEN** `plan-meta set` wird mit einem nicht erlaubten effort-Wert (`riesig`) aufgerufen
- **WHEN** `bash ticket.sh plan-meta set --id T-1 --effort riesig` ausgeführt wird
- **THEN** Exit-Code ist ungleich 0 und der Output enthält `"effort"`

#### Scenario: plan-meta get rejects missing --id *(BATS)*
- **GIVEN** `plan-meta get` wird ohne `--id`-Flag aufgerufen
- **WHEN** `bash ticket.sh plan-meta get` ausgeführt wird
- **THEN** Exit-Code ist ungleich 0 und der Output enthält `"--id"`

---

### Requirement: Planning Office Stats Computation
<!-- bats: planungsbuero-stats.bats | e2e: planungsbuero-smoke.spec.ts -->

The system SHALL compute planning, ready, and blocked counts from a list of ticket items and expose them via the stats bar in the UI.

#### Scenario: FA-PB-01 Stats-Berechnung bei leerer Liste *(BATS)*
- **GIVEN** eine leere Item-Liste `[]`
- **WHEN** `computeStats([])` aufgerufen wird
- **THEN** `{ planning: 0, ready: 0, blocked: 0 }` wird zurückgegeben

#### Scenario: FA-PB-02 Stats bei gemischten Items *(BATS)*
- **GIVEN** vier Items mit dorScore-Werten `[2, 1, 4, 2]`, wobei das letzte eine Abhängigkeit hat
- **WHEN** `computeStats(items)` aufgerufen wird
- **THEN** `planning = 4`, `ready = 1`, `blocked = 1`

#### Scenario: FA-PB-05 GET-Response enthält stats-Objekt mit korrekten Keys *(BATS)*
- **GIVEN** ein einzelnes Item mit `dorScore: 4` und leerer `dependsOn`-Liste
- **WHEN** `computeStats([item])` ausgewertet und die Keys des Ergebnisses geprüft werden
- **THEN** das Objekt enthält exakt die Keys `['blocked', 'planning', 'ready']`

#### Scenario: Stats Bar sichtbar mit korrektem Format *(E2E)*
- **GIVEN** die Admin-Seite `/dev-status?tab=planung` ist geladen und `pb-stats-bar` ist sichtbar
- **WHEN** der Inhalt der Stats Bar ausgewertet wird
- **THEN** der Text enthält `planning`, `ready` und `blocked`

---

### Requirement: Planungsbüro Queue Row Rendering
<!-- e2e: planungsbuero-smoke.spec.ts -->

The system SHALL render each planning ticket as a queue row that is at least 56 px high and opens a detail panel on click.

#### Scenario: Erste Queue-Zeile ist mindestens 56px hoch *(E2E)*
- **GIVEN** `/dev-status?tab=planung` ist geladen und mindestens eine Queue-Zeile ist sichtbar
- **WHEN** die Bounding-Box des ersten `pb-queue-row-*`-Elements gemessen wird
- **THEN** die Höhe ist größer oder gleich 56 px

#### Scenario: Klick auf Queue-Zeile öffnet Detail-Panel *(E2E)*
- **GIVEN** mindestens eine Queue-Zeile ist sichtbar
- **WHEN** die erste Zeile angeklickt wird
- **THEN** das Element `pb-detail` wird sichtbar innerhalb von 5 s

---

### Requirement: Promote-Button Locked Until DoR Complete
<!-- e2e: planungsbuero-smoke.spec.ts | e2e: fa-planning-office.spec.ts -->

The system SHALL keep the Promote button disabled as long as fewer than 4 DoR flags are set, and SHALL enable it only after all four flags are checked.

#### Scenario: Promote-Button ist disabled wenn Readiness < 4 *(E2E)*
- **GIVEN** eine Queue-Zeile mit weniger als 4 gesetzten DoR-Feldern ist ausgewählt
- **WHEN** das Detail-Panel geöffnet wird
- **THEN** der `pb-detail-promote`-Button ist `disabled`

#### Scenario: DoR-Toggle erhöht den Score und gibt Promote frei *(E2E)*
- **GIVEN** die erste Planungsbüro-Karte ist geöffnet und Promote ist initially deaktiviert
- **WHEN** alle vier DoR-Checkboxen (`spec_skizziert`, `offene_fragen_geklaert`, `abhaengigkeiten_klar`, `aufwand_geschaetzt`) gesetzt werden
- **THEN** der `office-promote`-Button wird aktiviert

---

### Requirement: Neue Idee anlegen und in Liste anzeigen
<!-- e2e: fa-planning-office.spec.ts -->

The system SHALL allow an admin to create a new planning idea via the add-form and SHALL display it immediately in the office list.

#### Scenario: Idee anlegen und in der Liste sehen *(E2E)*
- **GIVEN** die Seite `/admin/planungsbuero` ist geladen
- **WHEN** Titel `'E2E Testidee'` und Effort `'klein'` ausgefüllt und das Formular abgeschickt wird
- **THEN** die `office-list` enthält den Text `'E2E Testidee'`

---

### Requirement: Ranking Order Change via Up/Down Controls
<!-- e2e: fa-planning-office.spec.ts -->

The system SHALL reorder planning cards when the rank-up or rank-down controls are used.

#### Scenario: Rang ▲▼ ändert die Reihenfolge *(E2E)*
- **GIVEN** mindestens zwei Planungskarten sind sichtbar und die initiale Reihenfolge ist festgehalten
- **WHEN** der `office-rank-up`-Button der zweiten Karte angeklickt wird
- **THEN** das erste Element der Kartenliste unterscheidet sich von dem zuvor ersten Element

---

### Requirement: Inline Clarification Round — DoR Improvement
<!-- e2e: planungsbuero-klaerung.spec.ts -->

The system SHALL allow an admin to expand a card with DoR < 4, answer clarification fields, save, and observe the DoR score increase.

#### Scenario: Klärungsfelder ausfüllen und DoR-Score erhöht sich *(E2E)*
- **GIVEN** eine Planungsbüro-Karte mit DoR-Score < 4 existiert und ist über `office-expand` aufgeklappt
- **WHEN** alle sichtbaren Text-Inputs mit `'Geklärt (E2E)'` befüllt, ein Radio-Button und ggf. eine Checkbox gesetzt werden und `office-clarify-save` angeklickt wird
- **THEN** eine POST-Anfrage an `/clarify` antwortet mit `200 OK` und der DoR-Score der Karte ist höher als zuvor

---

### Requirement: PATCH Effort Value Validation
<!-- bats: planungsbuero-stats.bats -->

The system SHALL reject PATCH requests that set an invalid effort value outside the allowed set `['klein', 'mittel', 'gross']`.

#### Scenario: FA-PB-03 PATCH-Validierung lehnt ungültigen effort-Wert ab *(BATS)*
- **GIVEN** der effort-Wert `'riesig'` ist nicht in der Liste erlaubter Werte
- **WHEN** die Validierung `valid.includes('riesig')` ausgeführt wird
- **THEN** das Ergebnis ist `false`

---

### Requirement: Planning Rank DB Update
<!-- bats: planungsbuero-stats.bats -->

The system SHALL persist a `planning_rank` update via SQL UPDATE and reflect the new value on subsequent reads.

#### Scenario: FA-PB-04 Rang-Update via PATCH aktualisiert planning_rank *(BATS)*
- **GIVEN** ein Test-Ticket mit `planning_rank = 5` existiert in der DB (Test wird übersprungen wenn keine DB verfügbar)
- **WHEN** ein `UPDATE tickets.tickets SET planning_rank = 0` ausgeführt wird
- **THEN** der gespeicherte Wert von `planning_rank` ist `0`

---

### Requirement: Calendar Slot API
<!-- e2e: fa-16-booking.spec.ts | e2e: fa-slot-widget.spec.ts -->

The system SHALL serve available calendar slots as a JSON array via `/api/calendar/slots`, restricted to working days, and SHALL reject booking attempts for non-whitelisted or past slots.

#### Scenario: FA-16 T1 — /api/calendar/slots liefert JSON-Array *(E2E)*
- **GIVEN** der Server läuft und der CalDAV-Kalender ist erreichbar
- **WHEN** `GET /api/calendar/slots` aufgerufen wird
- **THEN** HTTP 200 und ein JSON-Array werden zurückgegeben

#### Scenario: FA-16 T2 — Slot-Objekte haben korrektes Schema *(E2E)*
- **GIVEN** `/api/calendar/slots` liefert mindestens einen Tag
- **WHEN** das erste Element des Arrays geprüft wird
- **THEN** es enthält die Felder `date`, `weekday`, `slots` (Array), und jeder Slot hat `start`, `end`, `display`

#### Scenario: FA-16 T3 — Nur Werktage (Mo–Fr) in Slots *(E2E)*
- **GIVEN** `/api/calendar/slots` liefert eine Liste von Tagen
- **WHEN** alle `weekday`-Werte geprüft werden
- **THEN** keiner der Tage ist `'Samstag'` oder `'Sonntag'`

#### Scenario: FA-16 T4 — /termin leitet zu Kontaktseite mit Termin-Tab weiter *(E2E)*
- **GIVEN** kein Slot ist vorgewählt
- **WHEN** `GET /termin` aufgerufen wird
- **THEN** die URL enthält `/kontakt` und der Button `'Termin buchen'` ist sichtbar

#### Scenario: FA-16 T5 — POST /api/booking ohne Daten liefert 400 *(E2E)*
- **GIVEN** ein leerer POST-Body `{}`
- **WHEN** `POST /api/booking` aufgerufen wird
- **THEN** HTTP 400 wird zurückgegeben

#### Scenario: FA-16 T6 — POST /api/booking mit nicht-gelisteten Slot liefert 409 *(E2E)*
- **GIVEN** ein Buchungs-Payload mit einem abgelaufenen Slot aus dem Jahr 2020
- **WHEN** `POST /api/booking` aufgerufen wird
- **THEN** HTTP 409 und `body.error` enthält `'verfügbar'`

---

### Requirement: Slot Widget Homepage Integration
<!-- e2e: fa-slot-widget.spec.ts -->

The system SHALL display either the slot widget or a fallback availability link on the homepage, and SHALL pass date/start/end parameters from slot pills through to the booking form.

#### Scenario: T1 — Homepage zeigt Slot-Widget oder Fallback-Link *(E2E)*
- **GIVEN** die Homepage `/` ist geladen
- **WHEN** auf das Slot-Widget oder den `/termin`-Fallback-Link gewartet wird
- **THEN** mindestens eines der beiden Elemente ist sichtbar innerhalb von 10 s

#### Scenario: T2 — /termin leitet mit date/start/end-Parametern weiter *(E2E)*
- **GIVEN** die URL `/termin?date=2026-12-15&start=09:00&end=09:30`
- **WHEN** die Seite geladen wird
- **THEN** die URL enthält `/kontakt`, `mode=termin` und `date=2026-12-15`

#### Scenario: T3 — Slot-URL befüllt Buchungsformular vor und überspringt Slot-Auswahl *(E2E)*
- **GIVEN** `/kontakt?mode=termin&date=2026-12-15&start=09:00&end=09:30` ist aufgerufen
- **WHEN** die Seite geladen ist
- **THEN** der `'Termin buchen'`-Button und das Kontaktfeld `#b-name` sind sichtbar ohne manuelle Slot-Auswahl

---

### Requirement: Systemtest 12 — Projektmanagement Walkthrough
<!-- e2e: systemtest-12-projektmanagement.spec.ts -->

The system SHALL successfully complete all 8 steps of System-Test 12 (Projektmanagement) without errors.

#### Scenario: Alle 8 Schritte des System-Tests 12 werden erfüllt *(E2E)*
- **GIVEN** ein Admin-Passwort ist gesetzt und der Systemtest-Runner ist verfügbar
- **WHEN** `walkSystemtestByTemplate(page, 12)` ausgeführt wird
- **THEN** alle Schritte werden als `'erfüllt'` durchlaufen und das Formular wird erfolgreich abgeschickt
