# grilling-flow

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Der Grilling-Flow ist das strukturierte Interview-System für die Ticket-Vorbereitung.
Es führt Admins Schritt für Schritt durch vordefinierte Fragebögen (Questionnaires), erlaubt
Multichoice-Chips als Schnellantworten, persistiert Antworten via PATCH-API, und ermöglicht
das Verwerfen irrelevanter Fragen. Zwei Built-in-Questionnaires existieren: `final-grilling-v1`
(23 Fragen, 6 Sektionen, Ticket-Vorbereitung) und `coaching-sessions-v1` (23 Fragen, 6 Sektionen,
Konzeption von Coaching-Sessions).

---

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
