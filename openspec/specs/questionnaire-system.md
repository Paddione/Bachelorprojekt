# questionnaire-system

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Questionnaire-System ist das Umfrage- und System-Test-Werkzeug der Plattform.
Es umfasst zwei Nutzungsmodi: **Coaching-Umfragen** (strukturierte Selbstauskunft von Kunden
mit gewichteten Dimensionen) und **System-Tests** (step-basierte QA-Läufe mit rrweb-Evidence).
Admins verwalten Vorlagen und Zuweisungen; Kunden füllen Fragebögen im Portal aus.

---

## Requirements

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

---

### Requirement: Coaching-JSON-Ingest CLI — Entrypoint und Kernmodul

The system SHALL provide a `coaching:ingest-json` task in `Taskfile.yml`, a CLI entrypoint
at `scripts/coaching/ingest-json.mts`, and a shared core module at
`website/src/lib/ingest-json-core.ts` that can be consumed by both the CLI and server-side code.

#### Scenario: Ingest-Infrastruktur vorhanden

- **GIVEN** das Projekt-Repository ist ausgecheckt
- **WHEN** die Dateipfade geprüft werden
- **THEN** existiert `scripts/coaching/ingest-json.mts` als ausführbares CLI-Skript
- **AND** existiert `website/src/lib/ingest-json-core.ts` als gemeinsame Kernbibliothek
- **AND** ist in `Taskfile.yml` genau ein Task `coaching:ingest-json:` definiert

---

### Requirement: Coaching-JSON-Ingest CLI — Argument-Validierung und Fehlerausgabe

The system SHALL exit with code 2 and print usage instructions when called with no arguments,
and SHALL exit with code 1 and print a field-level validation error message when the input
JSON is structurally invalid (e.g. missing required `content` field).

#### Scenario: Kein Argument übergeben

- **GIVEN** das CLI `ingest-json.mts` wird ohne Argumente aufgerufen
- **WHEN** der Prozess startet
- **THEN** beendet er sich mit Exit-Code 2
- **AND** enthält die Ausgabe den Hinweis "Usage:"

#### Scenario: JSON ohne Pflichtfeld `content`

- **GIVEN** eine JSON-Datei mit Einträgen, die das Pflichtfeld `content` nicht enthalten (z. B. `[{"id":"x"}]`)
- **WHEN** `ingest-json.mts <datei> <slug>` aufgerufen wird
- **THEN** beendet der Prozess sich mit Exit-Code 1
- **AND** enthält die Ausgabe die Fehlermeldung "content fehlt"

---

### Requirement: Archive Schema — assignment_scores Table and KPI View

The system SHALL initialise a `questionnaire_assignment_scores` table with columns `id`, `assignment_id`, `dimension_id`, `dimension_name`, `final_score`, `threshold_mid`, `threshold_high`, `level`, `snapshot_at` and a UNIQUE constraint on `(assignment_id, dimension_id)`, and SHALL expose a `bachelorprojekt.v_questionnaire_kpi` view that includes `evidence_count` and `latest_evidence_id` columns.

#### Scenario: Schema-Initialisierung beim Modul-Import

- **GIVEN** das Modul `questionnaire-db` wird importiert
- **WHEN** `initDb()` läuft
- **THEN** existiert die Tabelle `questionnaire_assignment_scores` in der `public`-Schema
- **AND** besitzt sie die Spalten `id`, `assignment_id`, `dimension_id`, `dimension_name`, `final_score`, `threshold_mid`, `threshold_high`, `level`, `snapshot_at` in dieser Reihenfolge
- **AND** ist ein UNIQUE-Index auf `(assignment_id, dimension_id)` vorhanden

#### Scenario: KPI-View mit Evidence-Metriken

- **GIVEN** die Schema-Initialisierung wurde ausgeführt
- **WHEN** die View `bachelorprojekt.v_questionnaire_kpi` abgefragt wird
- **THEN** enthält die View die Spalten `evidence_count` und `latest_evidence_id`

---

### Requirement: Schema-Ensure — einmalige DDL-Ausführung

The system SHALL expose an `ensureQuestionnaireSchemaOnce(pool)` function that issues the questionnaire `CREATE TABLE` DDL exactly once per process, regardless of how many times it is called sequentially or concurrently.

#### Scenario: Wiederholter sequentieller Aufruf

- **GIVEN** `ensureQuestionnaireSchemaOnce` wird dreimal hintereinander aufgerufen
- **WHEN** alle drei Aufrufe abgeschlossen sind
- **THEN** wurde das DDL für `questionnaire_templates` genau einmal an den Pool übergeben

#### Scenario: Gleichzeitige parallele Aufrufe

- **GIVEN** vier Aufrufe von `ensureQuestionnaireSchemaOnce` werden gleichzeitig via `Promise.all` gestartet
- **WHEN** alle Promises aufgelöst sind
- **THEN** wurde das DDL genau einmal ausgeführt (memoised init-Promise)

---

### Requirement: Score-Anzeigelogik — Snapshot vs. Live-Berechnung

The system SHALL return frozen snapshot scores for archived assignments and SHALL fall back to live score computation for non-archived assignments, such that renaming a dimension or changing thresholds after archiving has no effect on the displayed scores.

#### Scenario: Anzeige für archivierte Zuweisung

- **GIVEN** eine Zuweisung wurde archiviert und danach wurde die Dimension umbenannt
- **WHEN** `getDisplayScores` für diese Zuweisung aufgerufen wird
- **THEN** werden der ursprüngliche Score und der ursprüngliche Dimensionsname aus dem Snapshot zurückgegeben

#### Scenario: Anzeige für nicht-archivierte Zuweisung

- **GIVEN** eine Zuweisung im Status `submitted` ohne Score-Snapshot
- **WHEN** `getDisplayScores` aufgerufen wird
- **THEN** wird der Score live aus den gespeicherten Antworten berechnet und zurückgegeben

---

### Requirement: Evidence-Tracking per Test-Schritt

The system SHALL persist multiple evidence attempts per question and SHALL return for each question only the latest-attempt evidence row plus a total `evidence_count`, and SHALL return an empty array when no evidence exists.

#### Scenario: Mehrere Aufzeichnungsversuche für denselben Test-Schritt

- **GIVEN** für eine Frage wurden zwei Evidence-Einträge mit `attempt=0` und `attempt=1` gespeichert
- **WHEN** `listEvidenceByAssignment` aufgerufen wird
- **THEN** wird genau eine Zeile zurückgegeben mit `latest_attempt=1`, `latest_evidence_id` des neuesten Eintrags und `evidence_count=2`

#### Scenario: Keine Evidence vorhanden

- **GIVEN** eine Zuweisung ohne Evidence-Einträge
- **WHEN** `listEvidenceByAssignment` aufgerufen wird
- **THEN** wird ein leeres Array zurückgegeben

---

### Requirement: Coaching-Book- und Snippet-Verwaltung

The system SHALL support CRUD operations for coaching books (with chunk count), snippets (with tags and page number), and snippet clusters, including filtering snippets by tag.

#### Scenario: Snippet mit Tags anlegen und nach Tag filtern

- **GIVEN** zwei Snippets mit unterschiedlichen Tags wurden für dasselbe Buch angelegt
- **WHEN** `listSnippets` mit einem bestimmten Tag aufgerufen wird
- **THEN** wird nur der Snippet zurückgegeben, dessen Tags-Array diesen Tag enthält

#### Scenario: Snippet löschen

- **GIVEN** ein Snippet existiert in der Datenbank
- **WHEN** `deleteSnippet` für die Snippet-ID aufgerufen wird
- **THEN** gibt die Funktion `true` zurück und `listSnippets` zeigt null Einträge für dieses Buch

---

### Requirement: Draft-Workflow für Coaching-Inhalte

The system SHALL support an idempotent draft insertion keyed on `(knowledge_chunk_id, classifier_version)`, SHALL atomically create a snippet and flip the draft status to `accepted` on acceptance, and SHALL reject double-acceptance with an error.

#### Scenario: Idempotentes Draft-Insert

- **GIVEN** ein Draft für denselben Chunk und dieselbe `classifier_version` wird zweimal mit unterschiedlichen Payloads eingefügt
- **WHEN** beide `insertDraft`-Aufrufe abgeschlossen sind
- **THEN** ist die zurückgegebene ID identisch und der Payload des ersten Writes bleibt erhalten (first-write-wins)

#### Scenario: Draft akzeptieren erzeugt Snippet atomar

- **GIVEN** ein offenes Draft mit Payload `{ title, question }`
- **WHEN** `acceptDraft` aufgerufen wird
- **THEN** wird in `coaching.snippets` eine neue Zeile mit dem Draft-Titel angelegt und `created_from_draft` gesetzt
- **AND** der Draft-Status wechselt zu `accepted` und `resulting_snippet_id` zeigt auf das neue Snippet
- **AND** ein zweiter `acceptDraft`-Aufruf auf demselben Draft wirft einen Fehler mit dem Inhalt `not open`

---

### Requirement: Coaching-Session-Lifecycle

The system SHALL create sessions with status `active`, support step upsert (insert-or-update by `(session_id, step_number)`), allow status transitions with audit-log entries, and block the `completed → active` reverse transition.

#### Scenario: Session anlegen und Step speichern

- **GIVEN** eine neue Session wurde mit `createSession` angelegt
- **WHEN** `upsertStep` für `step_number=1` zweimal aufgerufen wird (beim zweiten Mal mit neuem `coachInputs` und `aiResponse`)
- **THEN** zeigt `getStep` die aktualisierten Werte des zweiten Calls und den Status `generated`

#### Scenario: Unerlaubter Status-Übergang completed → active

- **GIVEN** eine Session wurde mit `completeSession` abgeschlossen
- **WHEN** `updateSessionStatus` mit Zielstatus `active` aufgerufen wird
- **THEN** gibt die Funktion `null` zurück und der Sessionstatus bleibt `completed`

---

### Requirement: Step-Template Upsert und Prompt-Rendering

The system SHALL upsert step templates keyed on `(brand, step_number)`, SHALL return `null` for inactive templates via `getStepTemplate`, and SHALL render user-prompt templates by replacing `{key}` placeholders with input values and substituting `—` for any missing keys.

#### Scenario: Step-Template anlegen und aktualisieren

- **GIVEN** ein Step-Template für `(mentolder, step_number=1)` wird erstellt
- **WHEN** `upsertStepTemplate` mit demselben `(brand, step_number)` aber neuem `stepName` aufgerufen wird
- **THEN** gibt `getStepTemplate` den aktualisierten `stepName` zurück (ON CONFLICT DO UPDATE)

#### Scenario: Prompt-Rendering mit fehlenden Platzhaltern

- **GIVEN** ein Template mit `userPromptTpl = 'Wert: {missing}'`
- **WHEN** `buildPromptFromTemplate` mit leerem Inputs-Objekt aufgerufen wird
- **THEN** wird `'Wert: —'` zurückgegeben (Fallback-Dash für unbekannte Keys)

---

### Requirement: Coaching-Projekt Find-or-Create

The system SHALL find an existing project by `(brand, client_id)` unique index on repeated calls, SHALL create a new project when none exists and populate `customerNumber` from the customer record, and SHALL fall back to `client_id` as `customerNumber` when the customer has no `customer_number`.

#### Scenario: Idempotentes Anlegen eines Projekts

- **GIVEN** für einen Kunden existiert noch kein Coaching-Projekt
- **WHEN** `findOrCreateProject` zweimal mit derselben `(brand, clientId)`-Kombination aufgerufen wird
- **THEN** geben beide Aufrufe dieselbe Projekt-ID zurück

#### Scenario: Kein customer_number vorhanden

- **GIVEN** ein Kunde ohne `customer_number`-Eintrag
- **WHEN** `findOrCreateProject` aufgerufen wird
- **THEN** wird `project.customerNumber` auf die `client_id` des Kunden gesetzt

---

### Requirement: Publish-Kaskade für Coaching-Templates

The system SHALL on `publishTemplate` execute a surface-specific cascade: for `questionnaire` surfaces call `createQTemplate` and use its ID as `surface_ref`; for `assistant` surfaces add a knowledge document and use its ID as `surface_ref`; for `brett`/`chatroom` surfaces store the template without setting `surface_ref`. The system SHALL reject publication of a payload containing a verbatim quote longer than 280 characters and SHALL reject double-publication of an already-published template.

#### Scenario: Questionnaire-Kaskade

- **GIVEN** ein Template-Draft mit `target_surface = 'questionnaire'`
- **WHEN** `publishTemplate` aufgerufen wird
- **THEN** ist `template.status = 'published'` und `template.surfaceRef` entspricht der zurückgegebenen ID von `createQTemplate`

#### Scenario: Quote-Length-Verletzung und Doppel-Publikation

- **GIVEN** ein Template, dessen Payload ein verbatim-Zitat mit mehr als 280 Zeichen enthält
- **WHEN** `publishTemplate` aufgerufen wird
- **THEN** gibt die Funktion `{ ok: false, error: /quote-length violation/ }` zurück
- **AND** ein zweiter Aufruf auf einem bereits veröffentlichten Template (ohne Quote-Verletzung) gibt `{ ok: false, error: /already published/ }` zurück

---

### Requirement: Chunk-Klassifikation mit Retry und Schema-Validierung

The system SHALL classify a text chunk into one of the kinds `reflection`, `dialog_pattern`, `exercise`, `case_example`, `theory`, or `noise`, SHALL return structured payloads for actionable kinds and `null` payload for `theory`/`noise`, SHALL retry once on malformed LLM responses, and SHALL fall back to `noise` when the LLM payload fails schema validation.

#### Scenario: Erfolgreiche Klassifikation mit strukturiertem Payload

- **GIVEN** ein LLM-Client gibt eine valide JSON-Antwort vom Typ `reflection` zurück
- **WHEN** `classifyChunk` aufgerufen wird
- **THEN** gibt die Funktion `{ kind: 'reflection', payload: { question, ... }, model }` zurück

#### Scenario: Retry bei invalider Erstantwort und Schema-Fallback

- **GIVEN** der LLM-Client gibt beim ersten Aufruf kein valides JSON zurück, beim zweiten ein valides `theory`-Objekt
- **WHEN** `classifyChunk` aufgerufen wird
- **THEN** wird der LLM exakt zweimal aufgerufen und das Ergebnis hat `kind = 'theory'`
- **AND** wenn der zweite Versuch einen Payload liefert, der die Schema-Validierung verletzt, wird `kind = 'noise'` zurückgegeben

---

## Testszenarien

<!-- merged from Playwright e2e tests -->

### Requirement: Portal-API Auth-Gating
<!-- e2e: fa-fragebogen.spec.ts -->

The system SHALL reject all portal questionnaire API calls from unauthenticated callers with HTTP 401 or 403.

#### Scenario: Unauthenticated GET /api/portal/questionnaires *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist gesetzt
- **WHEN** `GET /api/portal/questionnaires` aufgerufen wird
- **THEN** antwortet das System mit HTTP 401 oder 403

#### Scenario: Unauthenticated GET /api/portal/questionnaires/:id *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist gesetzt
- **WHEN** `GET /api/portal/questionnaires/test-id` aufgerufen wird
- **THEN** antwortet das System mit HTTP 401 oder 403

#### Scenario: Unauthenticated PUT /api/portal/questionnaires/:id/answer *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist gesetzt
- **WHEN** `PUT /api/portal/questionnaires/test-id/answer` mit gültigem Body aufgerufen wird
- **THEN** antwortet das System mit HTTP 401 oder 403

#### Scenario: Unauthenticated POST /api/portal/questionnaires/:id/submit *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist gesetzt
- **WHEN** `POST /api/portal/questionnaires/test-id/submit` aufgerufen wird
- **THEN** antwortet das System mit HTTP 401 oder 403

#### Scenario: Unauthenticated Portal-Fragebogen-Seite leitet weiter *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist gesetzt
- **WHEN** `/portal/fragebogen/:id` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet (URL enthält nicht mehr `/portal/fragebogen`) und es erscheint kein 404

#### Scenario: Portal-Übersichtsseite Fragebögen-Abschnitt erreichbar *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist gesetzt
- **WHEN** `/portal?section=fragebögen` aufgerufen wird
- **THEN** antwortet das System nicht mit 404 oder 500

---

### Requirement: Portal Fill-Flow — Antwort und Einreichung
<!-- e2e: fa-fragebogen.spec.ts -->

The system SHALL redirect unauthenticated access to the fill page, SHALL accept answers via PUT and return HTTP 200, and SHALL mark the assignment as `submitted` after a POST to the submit endpoint.

#### Scenario: Fragebogen-Seite leitet unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** eine Zuweisung mit Status `pending` existiert in der Datenbank
- **WHEN** ein nicht eingeloggter Nutzer `/portal/fragebogen/:id` aufruft
- **THEN** wird er auf eine andere URL weitergeleitet und es erscheint kein 404

#### Scenario: PUT /api/portal/questionnaires/:id/answer gibt 200 zurück *(E2E)*
- **GIVEN** eine Zuweisung mit Status `pending` und eine passende Frage mit Antwortoption existieren; der Nutzer ist als Admin eingeloggt
- **WHEN** `PUT /api/portal/questionnaires/:id/answer` mit `{ question_id, option_key }` aufgerufen wird
- **THEN** antwortet das System mit HTTP 200

#### Scenario: POST submit setzt Status auf submitted *(E2E)*
- **GIVEN** eine Zuweisung mit Status `in_progress` existiert; der Nutzer ist als Admin eingeloggt
- **WHEN** `POST /api/portal/questionnaires/:id/submit` aufgerufen wird
- **THEN** antwortet das System mit HTTP 200 und die Datenbank-Zeile hat `status = 'submitted'`

---

### Requirement: Admin-Ansicht — Eingereichte Fragebögen
<!-- e2e: fa-fragebogen.spec.ts -->

The system SHALL render the admin detail page for submitted assignments without HTTP 404 or 500 errors.

#### Scenario: Admin-Detailseite für eingereichte Zuweisung erreichbar *(E2E)*
- **GIVEN** eine Zuweisung mit Status `submitted` existiert; der Admin ist eingeloggt
- **WHEN** `/admin/fragebogen/:id` aufgerufen wird
- **THEN** enthält die Seite keine 404- oder 500-Fehlermeldung

---

### Requirement: Archivierung → Neuzuweisung → Replay-Flow
<!-- e2e: fa-fragebogen.spec.ts -->

The system SHALL freeze a score snapshot on archive, display "Archiviert" in the UI, allow reassignment to a new pending row, and surface a replay button for archived system-tests that have evidence recordings.

#### Scenario: Archivierung erstellt Score-Snapshot und ermöglicht Neuzuweisung *(E2E)*
- **GIVEN** eine Zuweisung mit Status `submitted`, einer beantworteten Frage und einer Dimension mit Gewichtung
- **WHEN** der Admin den Archivierungs-Button klickt und die Seite aktualisiert ist
- **THEN** erscheint der Text "Archiviert" in der UI
- **AND** in `questionnaire_assignment_scores` existiert genau ein Score-Snapshot für die Zuweisung
- **AND** die KPI-View `bachelorprojekt.v_questionnaire_kpi` enthält eine Zeile mit korrektem `dimension_name` und `final_score`
- **AND** nach Klick auf den Neuzuweisungs-Button wird eine neue Zuweisung mit Status `pending` angelegt und die ursprüngliche bleibt `archived`

#### Scenario: Replay-Button erscheint bei archivierten System-Tests mit Evidence *(E2E)*
- **GIVEN** eine archivierte System-Test-Zuweisung mit einer `test_step`-Frage und einem Evidence-Eintrag
- **WHEN** der Admin die Detailseite aufruft
- **THEN** ist ein Replay-Button sichtbar und zeigt die Versuchsnummer an

---

### Requirement: Live-Umfrage (Poll) — API-Validierung und UI-Verhalten
<!-- e2e: fa-poll.spec.ts -->

The system SHALL return HTTP 404 with `{ error: "not found" }` for poll endpoints called with an invalid UUID format or a non-existent UUID, SHALL return HTTP 400 for a missing answer field, and SHALL render the poll page and results page gracefully when a poll does not exist.

#### Scenario: GET /api/poll/:id mit ungültigem UUID-Format gibt 404 zurück *(E2E)*
- **GIVEN** keine Umfrage existiert
- **WHEN** `GET /api/poll/not-a-uuid` aufgerufen wird
- **THEN** antwortet das System mit HTTP 404 und `{ error: "not found" }`

#### Scenario: GET /api/poll/:id mit nicht existenter UUID gibt 404 zurück *(E2E)*
- **GIVEN** keine Umfrage mit der angefragten UUID existiert
- **WHEN** `GET /api/poll/00000000-0000-0000-0000-000000000000` aufgerufen wird
- **THEN** antwortet das System mit HTTP 404 und `{ error: "not found" }`

#### Scenario: GET /api/poll/:id/results mit ungültigem UUID gibt 404 zurück *(E2E)*
- **GIVEN** keine Umfrage existiert
- **WHEN** `GET /api/poll/not-a-uuid/results` aufgerufen wird
- **THEN** antwortet das System mit HTTP 404 und `{ error: "not found" }`

#### Scenario: GET /api/poll/:id/results mit nicht existenter UUID gibt 404 zurück *(E2E)*
- **GIVEN** keine Umfrage mit der angefragten UUID existiert
- **WHEN** `GET /api/poll/00000000-0000-0000-0000-000000000000/results` aufgerufen wird
- **THEN** antwortet das System mit HTTP 404 und `{ error: "not found" }`

#### Scenario: POST /api/poll/:id/answer mit ungültigem UUID gibt 404 zurück *(E2E)*
- **GIVEN** keine Umfrage existiert
- **WHEN** `POST /api/poll/not-a-uuid/answer` mit Antwort aufgerufen wird
- **THEN** antwortet das System mit HTTP 404

#### Scenario: POST /api/poll/:id/answer mit nicht existenter UUID gibt 404 zurück *(E2E)*
- **GIVEN** keine Umfrage mit der angefragten UUID existiert
- **WHEN** `POST /api/poll/00000000-0000-0000-0000-000000000000/answer` mit Antwort aufgerufen wird
- **THEN** antwortet das System mit HTTP 404

#### Scenario: POST /api/poll/:id/answer ohne Antwortfeld gibt 400 oder 404 zurück *(E2E)*
- **GIVEN** keine Umfrage existiert
- **WHEN** `POST /api/poll/:id/answer` mit leerem Body aufgerufen wird
- **THEN** antwortet das System mit HTTP 400 oder 404

#### Scenario: Poll-Seite rendert bei nicht existenter Umfrage ohne 500 *(E2E)*
- **GIVEN** keine Umfrage mit der angefragten UUID existiert
- **WHEN** `/poll/:id` im Browser aufgerufen wird
- **THEN** antwortet die Seite ohne HTTP 500 und zeigt "Umfrage geschlossen"

#### Scenario: Poll-Ergebnisseite leitet bei nicht existenter Umfrage auf Homepage weiter *(E2E)*
- **GIVEN** keine Umfrage mit der angefragten UUID existiert
- **WHEN** `/poll/:id/results` im Browser aufgerufen wird
- **THEN** wird der Nutzer zur Startseite (`/`) weitergeleitet

---

### Requirement: System-Test 4 — Fragebogen-Workflow-Walkthrough
<!-- e2e: systemtest-04-fragebogen.spec.ts -->

The system SHALL allow walking all five steps of the questionnaire system test and submitting the result without error.

#### Scenario: System-Test 4 Komplettdurchlauf *(E2E)*
- **GIVEN** der Admin ist eingeloggt und System-Test-Vorlage Nr. 4 (Fragebogen-System) ist aktiv
- **WHEN** alle Schritte des System-Tests durchlaufen und der Test abgesendet wird
- **THEN** wird der Durchlauf ohne Fehler abgeschlossen

---

### Requirement: M3 Geführtes Onboarding — Nudge-Trigger und Mark-Step-API
<!-- e2e: fa-m3-onboarding-flow.spec.ts -->

The system SHALL return an onboarding nudge (`portal-first-login` or `portal-onboarding-sequence`) for newly logged-in portal users, SHALL include a non-empty `primaryAction.kickoff` on the first nudge, SHALL persist a completed onboarding step via POST and return `{ ok: true }`, and SHALL advance the sequence beyond the completed step on the next nudge fetch. Unauthenticated mark-step calls SHALL return HTTP 401; mark-step calls with missing `stepId` SHALL return HTTP 400.

#### Scenario: Onboarding-Nudge nach erstem Portal-Login *(E2E)*
- **GIVEN** ein Nutzer hat sich gerade erstmalig am Portal angemeldet
- **WHEN** `GET /api/assistant/nudges?profile=portal` aufgerufen wird
- **THEN** enthält die Antwort mindestens einen Nudge mit `triggerId = 'portal-first-login'` oder `triggerId = 'portal-onboarding-sequence'`

#### Scenario: Erster Onboarding-Nudge besitzt eine primaryAction *(E2E)*
- **GIVEN** ein Nutzer ist am Portal eingeloggt und das Onboarding hat noch nicht begonnen
- **WHEN** `GET /api/assistant/nudges?profile=portal` aufgerufen wird
- **THEN** hat der Onboarding-Nudge eine nicht-leere `primaryAction.kickoff`

#### Scenario: POST /api/portal/onboarding/mark-step persistiert Schritt *(E2E)*
- **GIVEN** ein Nutzer ist am Portal eingeloggt
- **WHEN** `POST /api/portal/onboarding/mark-step` mit `{ stepId: 'sidekick-intro' }` aufgerufen wird
- **THEN** antwortet das System mit HTTP 200 und `{ ok: true }`
- **AND** ein erneuter Nudge-Abruf zeigt nicht mehr `sidekick-intro` als aktiven Schritt

#### Scenario: Unauthenticated mark-step gibt 401 zurück *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist gesetzt
- **WHEN** `POST /api/portal/onboarding/mark-step` aufgerufen wird
- **THEN** antwortet das System mit HTTP 401

#### Scenario: mark-step ohne stepId gibt 400 zurück *(E2E)*
- **GIVEN** ein Nutzer ist am Portal eingeloggt
- **WHEN** `POST /api/portal/onboarding/mark-step` mit leerem Body aufgerufen wird
- **THEN** antwortet das System mit HTTP 400
