# grilling-flow

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Der Grilling-Flow ist das strukturierte Interview-System für die Ticket-Vorbereitung.
Es führt Admins Schritt für Schritt durch vordefinierte Fragebögen (Questionnaires), erlaubt
Multichoice-Chips als Schnellantworten, persistiert Antworten via PATCH-API, und ermöglicht
das Verwerfen irrelevanter Fragen. Zwei Built-in-Questionnaires existieren: `final-grilling-v1`
(23 Fragen, 6 Sektionen, Ticket-Vorbereitung) und `coaching-sessions-v1` (23 Fragen, 6 Sektionen,
Konzeption von Coaching-Sessions).

---

## Requirements

### Requirement: Questionnaire-Registry

The system SHALL provide a static in-memory registry of named questionnaires, each containing
ordered sections and questions, accessible by a stable string ID without any database or network
call.

#### Scenario: Bekannter Questionnaire-ID abrufen

- **GIVEN** die Registry enthält `final-grilling-v1`
- **WHEN** `getQuestionnaire('final-grilling-v1')` aufgerufen wird
- **THEN** wird ein Objekt mit `id`, `title` und `sections[]` zurückgegeben
- **AND** jede Section enthält `id`, `title` und `questions[]`

#### Scenario: Unbekannte ID

- **GIVEN** die Registry enthält keine Questionnaire mit ID `unknown-v99`
- **WHEN** `getQuestionnaire('unknown-v99')` aufgerufen wird
- **THEN** wird `undefined` zurückgegeben (kein Fehler geworfen)

---

### Requirement: Multichoice-Chips

The system SHALL expose an optional `choices` array on individual questions and SHALL render
those choices as clickable chip buttons in the step-mode UI, so that common answers can be
selected without free-text input.

#### Scenario: Chip-Auswahl befüllt Textarea

- **GIVEN** die aktuelle Frage hat `choices: ['Nein, rückwärtskompatibel', 'Ja, aber kontrolliert', ...]`
- **WHEN** der Nutzer auf den Chip "Ja, aber kontrolliert" klickt
- **THEN** wird der Antworttext der Frage auf "Ja, aber kontrolliert" gesetzt
- **AND** der Chip erscheint als aktiv markiert (gold border)
- **AND** die Textarea zeigt denselben Wert an

#### Scenario: Frage ohne Choices rendert keine Chips

- **GIVEN** die aktuelle Frage hat kein `choices`-Feld
- **WHEN** die Frage in step-mode angezeigt wird
- **THEN** wird kein Chip-Button mit `data-testid="grilling-choice-*"` gerendert

---

### Requirement: Debounced Autosave via PATCH

The system SHALL automatically persist grilling answers to the server via a PATCH request to
`/api/admin/tickets/:ticketId` after a 800 ms debounce period following each user input,
without requiring an explicit save button.

#### Scenario: Antwort tippen loest verzoegertes Speichern aus

- **GIVEN** der Nutzer ist auf einer Frage im step-mode
- **WHEN** er Text in die Textarea eingibt
- **THEN** wird nach 800 ms ein PATCH an `/api/admin/tickets/<ticketId>` gesendet
- **AND** der Body enthält `{ grillingAnswers: { <qnId>: { <qId>: "<text>" } } }`
- **AND** ein zweiter Tastendruck innerhalb von 800 ms setzt den Timer zurück (Debounce)

#### Scenario: Typ-Eingabe wechselt Frage nicht

- **GIVEN** der Nutzer tippt zeichenweise in die Textarea der aktuellen Frage
- **WHEN** jede Eingabe verarbeitet wird
- **THEN** bleibt dieselbe Frage sichtbar (kein automatisches Weiterschalten durch Eingabe)

---

### Requirement: Frage-Status (answered / dismissed / open)

The system SHALL classify each question as `answered`, `dismissed`, or `open`, where `answered`
always overrides `dismissed`, and SHALL sort open questions before non-open questions in the
step-mode queue.

#### Scenario: Beantwortet schlaegt Verworfen

- **GIVEN** eine Frage ist sowohl in `meta.dismissed` als auch mit einem nicht-leeren Antworttext vorhanden
- **WHEN** `questionStatus` berechnet wird
- **THEN** ist der Status `answered` (nicht `dismissed`)

#### Scenario: Offene Fragen zuerst

- **GIVEN** der Fragebogen enthält gemischte Statuses (answered, dismissed, open)
- **WHEN** `GrillingStepper` die Anzeigereihenfolge berechnet
- **THEN** erscheinen alle `open`-Fragen vor den `answered`- und `dismissed`-Fragen

---

### Requirement: Frage verwerfen (Dismiss)

The system SHALL allow an admin to permanently skip a question by dismissing it, SHALL add
the question ID to `grillingMeta.dismissed`, SHALL persist the meta state via PATCH, and SHALL
advance the queue to the next unanswered question.

#### Scenario: Verwerfen einer offenen Frage

- **GIVEN** der Nutzer sieht Frage q1 im step-mode
- **WHEN** er "Verwerfen" klickt
- **THEN** wird `meta[qnId].dismissed` um `q1` ergaenzt
- **AND** ein PATCH mit `{ grillingMeta: { <qnId>: { dismissed: ['q1'] } } }` wird gesendet
- **AND** die naechste offene Frage wird angezeigt

#### Scenario: Bereits verworfene Frage bleibt einfach in der Liste

- **GIVEN** q1 ist bereits in `meta[qnId].dismissed`
- **WHEN** `questionStatus` fuer q1 abgefragt wird (ohne Antwort)
- **THEN** ist der Status `dismissed` (kein Fehler, keine Duplikat-Eintraege)

---

### Requirement: Fortschrittsanzeige

The system SHALL compute and display live progress counts (total, answered, dismissed, open)
over the union of registry questions and absorbed meta questions for the active questionnaire.

#### Scenario: Fortschritts-Counter aktualisiert sich live

- **GIVEN** der Fragebogen hat 23 Registry-Fragen und 1 zusaetzliche Meta-Frage (total=24)
- **WHEN** 2 Fragen beantwortet und 1 verworfen ist
- **THEN** zeigt `data-testid="grilling-progress"` "2 beantwortet · 1 verworfen"
- **AND** `grillingProgress` liefert `{ total: 24, answered: 2, dismissed: 1, open: 21 }`

---

### Requirement: View-Modi (step / all)

The system SHALL support two display modes — step-mode (one question at a time with
Prev/Next/Dismiss navigation) and all-mode (full scrollable list) — switchable via a toggle
button without losing any entered answers.

#### Scenario: Umschalten auf All-Mode

- **GIVEN** der Nutzer ist im step-mode und hat Antworten eingetragen
- **WHEN** er den "Alle anzeigen"-Button klickt
- **THEN** wechselt der Modus auf `all`
- **AND** alle Fragen des Fragebogens sind als Liste sichtbar
- **AND** beantwortete Fragen zeigen ihre Antwort-Preview (truncated), verworfene erscheinen als "verworfen"

#### Scenario: Zurueck zu step-mode

- **GIVEN** der Nutzer ist im all-mode
- **WHEN** er "Schritt fuer Schritt" klickt
- **THEN** wechselt der Modus auf `step` und die naechste offene Frage wird angezeigt

---

### Requirement: Markdown-Dokument-Absorption (parseGrillingDoc)

The system SHALL parse freeform Markdown grilling documents into structured question lists,
supporting YAML frontmatter for questionnaire ID and title, multiple question markers
(## headings, numbered lists, `**bold?**`, explicit `{#id}` anchors), and both `Antwort:` /
blockquote answer patterns, without throwing on malformed input.

#### Scenario: Markdown mit Frontmatter und gemischten Markern

- **GIVEN** ein Markdown-Dokument mit `---` Frontmatter (`questionnaire:`, `title:`) und
  einer Mischung aus `## Heading`-, nummerierten Listen- und `{#id}`-Ankerfragen
- **WHEN** `parseGrillingDoc(content, fallbackId)` aufgerufen wird
- **THEN** wird `questionnaireId` aus dem Frontmatter-Feld `questionnaire` gelesen
- **AND** Fragen werden in Dokumentreihenfolge extrahiert, explizite `{#id}`-Anker werden als Frage-ID verwendet
- **AND** `Antwort:`- und `> Blockquote`-Zeilen werden als Antworttext erkannt (multi-line zusammengefuehrt)

#### Scenario: Placeholder-Antworten gelten als leer

- **GIVEN** eine Frage hat `Antwort: —` (oder `tbd`, `-`, `(offen)`, `n/a`)
- **WHEN** `parseGrillingDoc` das Dokument verarbeitet
- **THEN** hat die Frage kein `answer`-Feld (wird als unbeantwortete Frage behandelt)

#### Scenario: Fehlende Frontmatter faellt auf fallbackId zurueck

- **GIVEN** das Markdown-Dokument enthaelt keine `---`-Frontmatter-Sektion
- **WHEN** `parseGrillingDoc(content, 'my-file')` aufgerufen wird
- **THEN** ist `questionnaireId === 'my-file'` und `title === 'my-file'`

---

### Requirement: Session-Daten-Aufbereitung (buildGrillingSessionData)

The system SHALL assemble a `GrillingSessionData` object from a ticket context that includes
the resolved question list, per-question hints derived from the ticket body (truncated to
200 chars), pre-defined suggestion chips for known question IDs, existing answers, and
ticket attachments mapped as assets.

#### Scenario: Hints aus Ticket-Body

- **GIVEN** ein Ticket mit `body: "Der Visual Companion zeigt keine Vorschläge an."`
- **WHEN** `buildGrillingSessionData(ticket)` aufgerufen wird
- **THEN** enthaelt `hints[q.id]` fuer jede Frage einen Eintrag der mit `"Ticket: "` beginnt
- **AND** fuer bereits beantwortete Fragen wird `"Bereits beantwortet: <text>"` angehaengt

#### Scenario: Kein body - Fallback auf title

- **GIVEN** ein Ticket ohne `body`-Feld (nur `title`)
- **WHEN** `buildGrillingSessionData(ticket)` aufgerufen wird
- **THEN** werden Hints aus dem `title` befuellt (kein Fehler geworfen)
- **AND** `existingAnswers` ist `{}` und `assets` ist `[]`

#### Scenario: Anhaenge werden als Assets gemappt

- **GIVEN** ein Ticket hat `attachments: [{ filename, url, mimetype }]`
- **WHEN** `buildGrillingSessionData(ticket)` aufgerufen wird
- **THEN** enthaelt `assets` ein Element `{ name: filename, url, type: mimetype }`

---

### Requirement: Antwort-Export als Textdatei

The system SHALL allow the admin to download all grilling answers for the active questionnaire
as a plain-text file, and SHALL show the export button only when at least one answer exists.

#### Scenario: Export-Button nur bei vorhandenen Antworten

- **GIVEN** der Fragebogen hat noch keine Antworten
- **WHEN** `GrillingStepper` gerendert wird
- **THEN** ist kein Export-Button sichtbar

#### Scenario: Export loest Blob-Download aus

- **GIVEN** mindestens eine Antwort ist eingetragen
- **WHEN** der Nutzer auf "Export" klickt
- **THEN** wird ein Blob mit dem Dateinamen `grilling-<questionnaireId>.txt` erzeugt und heruntergeladen
- **AND** die Datei enthaelt Sektions-Ueberschriften und Frage/Antwort-Paare im Markdown-Format

---

### Requirement: CLI-Pflichtargument --id

The system SHALL require the `--id` flag when invoking `ticket.sh grill` and SHALL exit with
status 2 and an error message containing `--id is required` if the flag is absent, without
attempting any cluster connection.

#### Scenario: Fehlende --id beim Aufruf

- **GIVEN** `ticket.sh grill` wird ohne `--id`-Flag aufgerufen
- **WHEN** das Skript gestartet wird
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `--id is required`

---

### Requirement: CLI-Pflichtargument Antwortquelle

The system SHALL require exactly one answer source (`--answer`, `--json`, or `--grilling-doc`)
when invoking `ticket.sh grill` and SHALL exit with status 2 if none or more than one source
is provided.

#### Scenario: Keine Antwortquelle angegeben

- **GIVEN** `ticket.sh grill --id T000123` wird ohne Antwortquelle aufgerufen
- **WHEN** das Skript gestartet wird
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `one answer source is required`

#### Scenario: Mehr als eine Antwortquelle angegeben

- **GIVEN** `ticket.sh grill --id T000123 --json '{"q1":"a"}' --answer q2=b` wird aufgerufen
- **WHEN** das Skript gestartet wird
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `exactly one of`

---

### Requirement: CLI-Validierung malformierter --answer-Paare

The system SHALL validate that each `--answer` value contains exactly one `=` separator and
SHALL exit with status 2 and an error message containing `<qid>=<text>` if the format is
violated.

#### Scenario: --answer ohne Gleichheitszeichen

- **GIVEN** `ticket.sh grill --id T000123 --answer noequalshere` wird aufgerufen
- **WHEN** das Skript die Argumente validiert
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `<qid>=<text>`

---

### Requirement: Mehrfache --answer-Paare zu JSON zusammenfuehren

The system SHALL aggregate multiple `--answer key=value` flags into a single JSON object and
SHALL include every key-value pair in the PATCH payload sent to the database.

#### Scenario: Zwei --answer-Paare werden zu einem Objekt gebaut

- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo --answer q2=bar` wird aufgerufen
- **WHEN** das Skript ausgefuehrt wird und Exit-Code 0 liefert
- **THEN** enthält das an kubectl exec weitergeleitete SQL `"q1":"foo"`
- **AND** dasselbe SQL enthält `"q2":"bar"`

---

### Requirement: Idempotentes Datenbankschema und Merge-SQL

The system SHALL emit SQL that idempotently adds the `grilling_answers JSONB` column via
`ADD COLUMN IF NOT EXISTS` and SHALL merge new answers into the existing JSONB value using
`COALESCE(grilling_answers, '{}') || jsonb_build_object(...)` so that repeated invocations
never lose previously stored answers.

#### Scenario: Schema-Migration und Merge bei erstem Aufruf

- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript SQL an kubectl exec uebergibt
- **THEN** enthält das SQL `ADD COLUMN IF NOT EXISTS grilling_answers JSONB`
- **AND** enthält das SQL `UPDATE tickets.tickets`
- **AND** enthält das SQL `jsonb_build_object` und `COALESCE(grilling_answers`

---

### Requirement: Timeline-Kommentar nach Grilling-Aufruf

The system SHALL by default insert a `grilling`-authored comment into `tickets.ticket_comments`
after persisting answers, and SHALL skip this insert when `--no-comment` is passed.

#### Scenario: Standard-Aufruf schreibt Timeline-Kommentar

- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** enthält das ausgegebene SQL `INSERT INTO tickets.ticket_comments`
- **AND** enthält es den Autor-Wert `'grilling'`

#### Scenario: --no-comment unterdrueckt den Kommentar-Insert

- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo --no-comment` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** enthält das ausgegebene SQL keinen `INSERT INTO tickets.ticket_comments`-Block

---

### Requirement: --grilling-doc Dateivalidierung

The system SHALL reject a `--grilling-doc` path that does not point to an existing non-empty
file by exiting with status 2 and an error message containing `grilling doc missing or empty`.

#### Scenario: Nicht existierende Datei wird abgelehnt

- **GIVEN** `ticket.sh grill --id T000999 --grilling-doc /no/such/file.md` wird aufgerufen
- **WHEN** das Skript die Datei prüft
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `grilling doc missing or empty`

---

### Requirement: --grilling-doc und --json sind gegenseitig ausschliessend

The system SHALL treat `--grilling-doc` as an answer source subject to the same mutual-exclusion
rule as `--json` and `--answer`, and SHALL exit with status 2 if more than one source is
combined.

#### Scenario: --grilling-doc kombiniert mit --json

- **GIVEN** `ticket.sh grill --id T000999 --grilling-doc g.md --json '{"q1":"x"}'` wird aufgerufen
- **WHEN** das Skript die Argumente prueft
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `exactly one of`

---

### Requirement: --dry-run-json trennt beantwortete und unbeantwortete Fragen

The system SHALL, when `--grilling-doc --dry-run-json` is used, output a JSON object that
includes `questionnaireId` from the document frontmatter, a populated `answers` map for
questions with non-placeholder answers, and question entries with explicit `{#id}` anchors
resolved to those IDs — without executing any database write.

#### Scenario: Dry-run trennt Antworten nach Status

- **GIVEN** ein Markdown-Dokument mit Frontmatter `questionnaire: gekko-x`, einer beantworteten Frage, einer leeren Frage und einer Frage mit `{#drei}`-Anker und Placeholder-Antwort `A: —`
- **WHEN** `ticket.sh grill --id T000999 --grilling-doc g.md --dry-run-json` aufgerufen wird
- **THEN** enthält die JSON-Ausgabe `"questionnaireId":"gekko-x"`
- **AND** enthält `"answers":{"q1":"Antwort eins."}`
- **AND** enthält ein Question-Objekt mit `"id":"drei"` ohne entsprechenden Eintrag in `answers`

---

### Requirement: Automatische Frage-ID-Vergabe und nummerierte Listen-Marker

The system SHALL auto-assign sequential IDs `q1`, `q2`, ... to questions that lack an explicit
`{#id}` anchor and SHALL recognise numbered list markers (`1.`, `2)`, etc.) as question
delimiters equivalent to `##` headings.

#### Scenario: Nummerierte Liste mit automatischer ID-Vergabe

- **GIVEN** ein Markdown-Dokument mit `1. Erste?\nAntwort: A.\n2) Zweite?\n` (keine expliziten IDs)
- **WHEN** `ticket.sh grill --id T000999 --grilling-doc n.md --dry-run-json` aufgerufen wird
- **THEN** enthält die JSON-Ausgabe `"answers":{"q1":"A."}`
- **AND** enthält ein Question-Objekt mit `"id":"q2"` fuer die zweite Frage

---

### Requirement: Deprecation-Warnung auf stderr

The system SHALL emit a deprecation warning on stderr when `ticket.sh grill` is invoked,
referring users to `vda.sh ticket triage`, while leaving stdout unverändert so that
machine-readable output remains parseable.

#### Scenario: Deprecation-Meldung auf stderr

- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** enthält stderr `deprecated`
- **AND** enthält stderr `vda.sh ticket triage`

#### Scenario: Stdout bleibt frei von Deprecation-Text

- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** beginnt stdout mit `Grilling session`
- **AND** enthält stdout nicht das Wort `deprecated`

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->
<!-- bats: tests/unit/ticket-grill.bats -->
<!-- e2e: tests/e2e/specs/fa-qa-review.spec.ts covers QS-Abnahme (unrelated component — not merged here) -->

### Requirement: CLI-Pflichtargument --id
<!-- bats: ticket-grill.bats -->

The system SHALL require the `--id` flag when invoking `ticket.sh grill` and SHALL exit with
status 2 and an error message containing `--id is required` if the flag is absent, without
attempting any cluster connection.

#### Scenario: Fehlende --id beim Aufruf *(BATS)*
- **GIVEN** `ticket.sh grill` wird ohne `--id`-Flag, aber mit `--answer q1=foo` aufgerufen
- **WHEN** das Skript startet
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `--id is required`

---

### Requirement: CLI-Pflichtargument Antwortquelle
<!-- bats: ticket-grill.bats -->

The system SHALL require exactly one answer source (`--answer`, `--json`, or `--grilling-doc`)
when invoking `ticket.sh grill` and SHALL exit with status 2 if none or more than one source
is provided.

#### Scenario: Keine Antwortquelle angegeben *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123` wird ohne Antwortquelle aufgerufen
- **WHEN** das Skript startet
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `one answer source is required`

#### Scenario: Mehr als eine Antwortquelle angegeben *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --json '{"q1":"a"}' --answer q2=b` wird aufgerufen
- **WHEN** das Skript startet
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `exactly one of`

---

### Requirement: CLI-Validierung malformierter --answer-Paare
<!-- bats: ticket-grill.bats -->

The system SHALL validate that each `--answer` value contains exactly one `=` separator and
SHALL exit with status 2 and an error message containing `<qid>=<text>` if the format is
violated.

#### Scenario: --answer ohne Gleichheitszeichen *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --answer noequalshere` wird aufgerufen
- **WHEN** das Skript die Argumente validiert
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `<qid>=<text>`

---

### Requirement: Mehrfache --answer-Paare zu JSON zusammenfuehren
<!-- bats: ticket-grill.bats -->

The system SHALL aggregate multiple `--answer key=value` flags into a single JSON object and
SHALL include every key-value pair in the PATCH payload sent to the database.

#### Scenario: Zwei --answer-Paare werden zu einem Objekt gebaut *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo --answer q2=bar` wird aufgerufen
- **WHEN** das Skript mit Exit-Code 0 ausfuehrt
- **THEN** enthält das an kubectl exec weitergeleitete SQL `"q1":"foo"`
- **AND** dasselbe SQL enthält `"q2":"bar"`

---

### Requirement: Idempotentes Datenbankschema und Merge-SQL
<!-- bats: ticket-grill.bats -->

The system SHALL emit SQL that idempotently adds the `grilling_answers JSONB` column via
`ADD COLUMN IF NOT EXISTS` and SHALL merge new answers using `COALESCE(grilling_answers, '{}') || jsonb_build_object(...)`.

#### Scenario: Schema-Migration und Merge bei erstem Aufruf *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript SQL an kubectl exec uebergibt
- **THEN** enthält das SQL `ADD COLUMN IF NOT EXISTS grilling_answers JSONB`
- **AND** enthält das SQL `UPDATE tickets.tickets`
- **AND** enthält das SQL `jsonb_build_object` und `COALESCE(grilling_answers`

---

### Requirement: Timeline-Kommentar nach Grilling-Aufruf
<!-- bats: ticket-grill.bats -->

The system SHALL by default insert a `grilling`-authored comment into `tickets.ticket_comments`
after persisting answers, and SHALL skip this insert when `--no-comment` is passed.

#### Scenario: Standard-Aufruf schreibt Timeline-Kommentar *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** enthält das ausgegebene SQL `INSERT INTO tickets.ticket_comments`
- **AND** enthält es den Autor-Wert `'grilling'`

#### Scenario: --no-comment unterdrueckt den Kommentar-Insert *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo --no-comment` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** enthält das ausgegebene SQL keinen `INSERT INTO tickets.ticket_comments`-Block

---

### Requirement: --grilling-doc Dateivalidierung
<!-- bats: ticket-grill.bats -->

The system SHALL reject a `--grilling-doc` path that does not point to an existing non-empty
file by exiting with status 2 and an error message containing `grilling doc missing or empty`.

#### Scenario: Nicht existierende Datei wird abgelehnt *(BATS)*
- **GIVEN** `ticket.sh grill --id T000999 --grilling-doc /no/such/file.md` wird aufgerufen
- **WHEN** das Skript die Datei prueft
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `grilling doc missing or empty`

---

### Requirement: --grilling-doc und --json sind gegenseitig ausschliessend
<!-- bats: ticket-grill.bats -->

The system SHALL treat `--grilling-doc` as an answer source subject to the same mutual-exclusion
rule as `--json` and `--answer`, and SHALL exit with status 2 if more than one source is combined.

#### Scenario: --grilling-doc kombiniert mit --json *(BATS)*
- **GIVEN** `ticket.sh grill --id T000999 --grilling-doc g.md --json '{"q1":"x"}'` wird aufgerufen
- **WHEN** das Skript die Argumente prueft
- **THEN** endet es mit Exit-Code 2
- **AND** die Ausgabe enthält `exactly one of`

---

### Requirement: --dry-run-json trennt beantwortete und unbeantwortete Fragen
<!-- bats: ticket-grill.bats -->

The system SHALL, when `--grilling-doc --dry-run-json` is used, output a JSON object that
includes `questionnaireId` from the document frontmatter, a populated `answers` map for
questions with non-placeholder answers, and question entries with explicit `{#id}` anchors
resolved to those IDs — without executing any database write.

#### Scenario: Dry-run trennt Antworten nach Status *(BATS)*
- **GIVEN** ein Markdown-Dokument mit Frontmatter `questionnaire: gekko-x`, einer beantworteten Frage, einer leeren Frage und einer Frage mit `{#drei}`-Anker und Placeholder-Antwort `A: —`
- **WHEN** `ticket.sh grill --id T000999 --grilling-doc g.md --dry-run-json` aufgerufen wird
- **THEN** enthält die JSON-Ausgabe `"questionnaireId":"gekko-x"`
- **AND** enthält `"answers":{"q1":"Antwort eins."}`
- **AND** enthält ein Question-Objekt mit `"id":"drei"` ohne entsprechenden Eintrag in `answers`

---

### Requirement: Automatische Frage-ID-Vergabe und nummerierte Listen-Marker
<!-- bats: ticket-grill.bats -->

The system SHALL auto-assign sequential IDs `q1`, `q2`, ... to questions that lack an explicit
`{#id}` anchor and SHALL recognise numbered list markers (`1.`, `2)`, etc.) as question
delimiters equivalent to `##` headings.

#### Scenario: Nummerierte Liste mit automatischer ID-Vergabe *(BATS)*
- **GIVEN** ein Markdown-Dokument mit `1. Erste?\nAntwort: A.\n2) Zweite?\n` (keine expliziten IDs)
- **WHEN** `ticket.sh grill --id T000999 --grilling-doc n.md --dry-run-json` aufgerufen wird
- **THEN** enthält die JSON-Ausgabe `"answers":{"q1":"A."}`
- **AND** enthält ein Question-Objekt mit `"id":"q2"` fuer die zweite Frage

---

### Requirement: Deprecation-Warnung auf stderr
<!-- bats: ticket-grill.bats -->

The system SHALL emit a deprecation warning on stderr when `ticket.sh grill` is invoked,
referring users to `vda.sh ticket triage`, while leaving stdout unveraendert so that
machine-readable output remains parseable.

#### Scenario: Deprecation-Meldung auf stderr *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** enthält stderr `deprecated`
- **AND** enthält stderr `vda.sh ticket triage`

#### Scenario: Stdout bleibt frei von Deprecation-Text *(BATS)*
- **GIVEN** `ticket.sh grill --id T000123 --answer q1=foo` wird aufgerufen
- **WHEN** das Skript erfolgreich ausfuehrt
- **THEN** beginnt stdout mit `Grilling session`
- **AND** enthält stdout nicht das Wort `deprecated`
