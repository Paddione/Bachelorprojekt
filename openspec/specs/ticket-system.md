# ticket-system

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Dieses Dokument beschreibt das Ticket-System und seinen Lifecycle im Bachelorprojekt-Workspace.
Es umfasst die Datenstruktur, Statusübergänge, Brand-Isolation, Pipeline-Lanes, Reporter-Benachrichtigung,
Cockpit-Rollup, KI-gestützte Feature-Priorisierung und die Anforderungsverriegelung (Lastenheft-Lock).

---

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
