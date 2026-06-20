# questionnaire-system

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Das Questionnaire-System ist das Umfrage- und System-Test-Werkzeug der Plattform.
Es umfasst zwei Nutzungsmodi: **Coaching-Umfragen** (strukturierte Selbstauskunft von Kunden
mit gewichteten Dimensionen) und **System-Tests** (step-basierte QA-Läufe mit rrweb-Evidence).
Admins verwalten Vorlagen und Zuweisungen; Kunden füllen Fragebögen im Portal aus.

---

### Requirement: Template-Lifecycle (draft → published → archived)

The system SHALL enforce a template status lifecycle and SHALL reject assignment creation
for templates that are not in `published` status.

#### Scenario: Zuweisung einer unveröffentlichten Vorlage

- **GIVEN** ein Admin ruft `POST /api/admin/questionnaires/assign` auf
- **WHEN** die referenzierte Vorlage den Status `draft` oder `archived` hat
- **THEN** antwortet das System mit HTTP 409 und der Meldung "Nur veröffentlichte Vorlagen können zugewiesen werden."

#### Scenario: Zuweisung einer veröffentlichten Vorlage

- **GIVEN** ein Admin ruft `POST /api/admin/questionnaires/assign` mit einer `published`-Vorlage auf
- **WHEN** der Keycloak-Nutzer existiert und hat eine E-Mail-Adresse
- **THEN** wird eine neue Zuweisung mit Status `pending` angelegt und eine Benachrichtigungsmail an den Kunden gesendet

---

### Requirement: Projekt-Verknüpfung bei Coaching-Zuweisung

The system SHALL automatically create a linked project ticket when a non-system-test
questionnaire is assigned, and SHALL skip project creation for system-test templates.

#### Scenario: Coaching-Fragebogen wird zugewiesen

- **GIVEN** eine Vorlage mit `is_system_test = false` wird einem Kunden zugewiesen
- **WHEN** `POST /api/admin/questionnaires/assign` erfolgreich abgeschlossen wird
- **THEN** wird ein Projekt-Ticket mit Titel `{template.title} — {clientName}` angelegt
- **AND** die Zuweisung erhält `project_id` gesetzt auf die neue Projekt-ID

#### Scenario: System-Test-Vorlage wird zugewiesen

- **GIVEN** eine Vorlage mit `is_system_test = true` wird einem Kunden zugewiesen
- **WHEN** `POST /api/admin/questionnaires/assign` ausgeführt wird
- **THEN** wird kein Projekt-Ticket angelegt und `project_id` bleibt `null`

---

### Requirement: Antwort-Speicherung mit Status-Übergang

The system SHALL persist each individual answer immediately (upsert-Semantik) and SHALL
promote the assignment status from `pending` to `in_progress` on the first answer saved,
without requiring the user to complete all questions before saving.

#### Scenario: Erste Antwort speichern

- **GIVEN** eine Zuweisung im Status `pending` existiert für den eingeloggten Kunden
- **WHEN** `PUT /api/portal/questionnaires/{id}/answer` mit `question_id` und `option_key` aufgerufen wird
- **THEN** wird die Antwort in `questionnaire_answers` gespeichert (INSERT oder UPDATE)
- **AND** der Zuweisungsstatus wechselt zu `in_progress`

#### Scenario: Antwort auf bereits abgesendeten Fragebogen

- **GIVEN** eine Zuweisung im Status `submitted` oder `reviewed`
- **WHEN** `PUT /api/portal/questionnaires/{id}/answer` aufgerufen wird
- **THEN** antwortet das System mit HTTP 409 und lehnt die Änderung ab

---

### Requirement: Einreichung mit automatischer Auswertung und E-Mail-Benachrichtigung

The system SHALL on submission atomically set status to `submitted`, update all test-step
statuses, auto-evaluate dimension scores, and notify the admin by email — all as best-effort
steps that do not roll back the submission if a downstream step fails.

#### Scenario: Erfolgreiche Einreichung

- **GIVEN** ein Kunde mit einer Zuweisung im Status `pending` oder `in_progress`
- **WHEN** `POST /api/portal/questionnaires/{id}/submit` aufgerufen wird
- **THEN** wird der Status auf `submitted` gesetzt und `submitted_at` auf den aktuellen Zeitstempel
- **AND** `updateTestStatuses` und `autoEvaluateQAssignment` werden aufgerufen (Fehler werden geloggt, nicht propagiert)
- **AND** eine E-Mail wird an die Admin-Adresse gesendet mit Link zur Auswertungsseite

#### Scenario: Doppelte Einreichung

- **GIVEN** eine Zuweisung im Status `submitted`, `reviewed` oder `dismissed`
- **WHEN** `POST /api/portal/questionnaires/{id}/submit` erneut aufgerufen wird
- **THEN** antwortet das System mit HTTP 409 und der Meldung "Bereits abgesendet."

---

### Requirement: Archivierung mit Dimension-Score-Snapshot

The system SHALL on archiving compute and persist a frozen score snapshot per dimension,
and SHALL reject archiving of assignments in status `pending`, `in_progress`, or `dismissed`.
The snapshot SHALL remain immutable after archiving even if template dimensions are later modified.

#### Scenario: Archivierung einer eingereichten Zuweisung

- **GIVEN** eine Zuweisung im Status `submitted` oder `reviewed`
- **WHEN** `POST /api/admin/questionnaires/assignments/{id}/archive` (Admin) oder der Status wird via `updateQAssignment` auf `archived` gesetzt
- **THEN** wird für jede Dimension des Templates eine Zeile in `questionnaire_assignment_scores` eingefügt (falls noch nicht vorhanden)
- **AND** der `level`-Wert wird aus den Schwellwerten `threshold_mid` / `threshold_high` berechnet (`förderlich` / `mittel` / `kritisch`)
- **AND** `archived_at` wird gesetzt

#### Scenario: Idempotenz der Archivierung

- **GIVEN** eine bereits archivierte Zuweisung
- **WHEN** `archiveQAssignment` erneut aufgerufen wird
- **THEN** bleibt der bestehende Score-Snapshot unverändert (ON CONFLICT DO NOTHING)

#### Scenario: Archivierung nicht erlaubter Status

- **GIVEN** eine Zuweisung im Status `pending`
- **WHEN** `POST /api/admin/questionnaires/assignments/{id}/archive` aufgerufen wird
- **THEN** antwortet das System mit HTTP 409 und gibt den aktuellen Status zurück

---

### Requirement: Wiedereröffnung (Reopen) mit Antwort-Reset und Retest-Bump

The system SHALL on reopen wipe all existing answers and reset all completion timestamps,
preserve coach notes and rrweb evidence rows, and bump the `retest_attempt` counter on
every `test_step` question so that subsequent evidence uploads are partitioned by attempt.

#### Scenario: Fragebogen wiedereröffnen

- **GIVEN** eine Zuweisung im Status `submitted`, `reviewed`, `archived` oder `dismissed`
- **WHEN** `POST /api/admin/questionnaires/assignments/{id}/reopen` aufgerufen wird
- **THEN** wechselt der Status zurück zu `pending`
- **AND** `submitted_at`, `reviewed_at`, `archived_at`, `dismissed_at` und `dismiss_reason` werden auf `NULL` gesetzt
- **AND** alle `questionnaire_answers`-Zeilen für diese Zuweisung werden gelöscht
- **AND** `retest_attempt` in `questionnaire_test_status` wird für alle `test_step`-Fragen des Templates inkrementiert

#### Scenario: Wiedereröffnung im Status `pending` oder `in_progress`

- **GIVEN** eine Zuweisung im Status `pending` oder `in_progress`
- **WHEN** `POST /api/admin/questionnaires/assignments/{id}/reopen` aufgerufen wird
- **THEN** antwortet das System mit HTTP 409

---

### Requirement: System-Test-Schritt-Tracking mit Failure-Bridge

The system SHALL maintain a per-question `questionnaire_test_status` row that records the
last test result and last success timestamp, and SHALL automatically open a bug ticket via
the failure-bridge when a `test_step` is answered as `nicht_erfüllt`. Failure-bridge errors
SHALL be caught and enqueued in the outbox without blocking the answer save.

#### Scenario: Test-Schritt als "nicht erfüllt" markiert

- **GIVEN** eine Zuweisung für ein System-Test-Template wird eingereicht
- **WHEN** ein Test-Schritt mit `option_key = 'nicht_erfüllt'` gespeichert wurde
- **THEN** aktualisiert `updateTestStatuses` die `questionnaire_test_status`-Zeile mit `last_result = 'nicht_erfüllt'`
- **AND** `openFailureTicket` wird aufgerufen, um ein Bug-Ticket zu erstellen
- **AND** schlägt `openFailureTicket` fehl, wird der Fehler in `systemtest_failure_outbox` eingereiht

#### Scenario: Test-Schritt als "erfüllt" markiert

- **GIVEN** ein Test-Schritt mit `option_key = 'erfüllt'` wird verarbeitet
- **WHEN** `updateTestStatuses` läuft
- **THEN** wird `last_success_at` auf den aktuellen Zeitstempel aktualisiert
- **AND** kein Failure-Bridge-Aufruf erfolgt

---

### Requirement: Portal-Sichtbarkeit — nur aktive Zuweisungen

The system SHALL expose only assignments with status `pending` or `in_progress` via the
portal list endpoint used by the chat widget, and SHALL hide `dismissed` and `archived`
assignments from portal users without deleting them.

#### Scenario: Chat-Widget lädt Fragebogen-Liste

- **GIVEN** ein eingeloggter Kunde mit gemischten Zuweisungen (pending, archived, dismissed)
- **WHEN** `GET /api/portal/questionnaires` aufgerufen wird
- **THEN** werden nur Zuweisungen mit Status `pending` oder `in_progress` zurückgegeben

#### Scenario: Direkter Zugriff auf archivierten Fragebogen

- **GIVEN** ein Kunde ruft `GET /api/portal/questionnaires/{id}` mit einer archivierten Zuweisung auf
- **WHEN** die Zuweisung der eigenen `customer_id` gehört
- **THEN** wird die Zuweisung vollständig zurückgegeben (kein 404 — direkte Links bleiben gültig)

---

### Requirement: Neuzuweisung (Reassign) ohne Datenverlust

The system SHALL on reassignment create a fresh `pending` assignment for the same
customer and template, leaving the original assignment untouched in its current status.

#### Scenario: Admin erstellt neue Zuweisung aus abgeschlossenem Auftrag

- **GIVEN** eine archivierte Zuweisung existiert für Kunde C mit Template T
- **WHEN** `POST /api/admin/questionnaires/assignments/{id}/reassign` aufgerufen wird
- **THEN** wird eine neue Zuweisung mit Status `pending` für Kunde C und Template T angelegt
- **AND** die ursprüngliche Zuweisung bleibt im Status `archived` mit allen Antworten und Score-Snapshots erhalten
- **AND** coach_notes, submitted_at und archived_at der neuen Zuweisung sind leer/null
