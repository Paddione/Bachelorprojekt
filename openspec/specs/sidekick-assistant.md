# sidekick-assistant

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Sidekick-System ist der KI-gestützte In-App-Assistent und Nudge-Kanal der Website.
Es besteht aus zwei Schichten: einem proaktiven **Nudge-System** (kontextgebundene Push-Hinweise)
und einem reaktiven **Chat-Interface** mit optionaler RAG-Anreicherung aus Coaching-Büchern.
Das System kennt zwei Profile — `admin` (Coach) und `portal` (Klient) — mit strikt getrennten
Triggern, Aktionen und Seitenmenüs.

---

## Requirements

### Requirement: Profilbasierte Zugriffstrennung

The system SHALL enforce strict separation between `admin` and `portal` profiles so that
actions registered for one profile are never executable from the other profile, and nudge
triggers fire only for the intended audience.

#### Scenario: Portal-Nutzer kann keine Admin-Aktion auslösen

- **GIVEN** ein eingeloggter Klient (Profil `portal`) schickt einen `POST /api/assistant/execute`-Request mit einer `admin:`-Action-ID
- **WHEN** der Server die Aktion auflöst
- **THEN** wird die Anfrage mit einem `403`-artigen Fehler abgelehnt, da das Profil nicht in `allowedProfiles` liegt

#### Scenario: Admin-Trigger feuert nicht im Portal

- **GIVEN** das System wertet Trigger für Profil `portal` aus
- **WHEN** `evaluateTriggers('portal', ctx)` aufgerufen wird
- **THEN** werden nur Trigger mit `profile === 'portal'` evaluiert; Admin-Trigger bleiben inaktiv

---

### Requirement: Nudge-Polling mit Tab-Visibility-Guard

The system SHALL poll the nudge endpoint every 45 seconds and SHALL skip polling when the
browser tab is hidden, to avoid unnecessary network traffic in background tabs.

#### Scenario: Tab ist sichtbar

- **GIVEN** der Nutzer hat den Tab aktiv im Vordergrund
- **WHEN** das 45-Sekunden-Intervall abläuft
- **THEN** wird `GET /api/assistant/nudges?profile=<p>&route=<url>` abgeschickt und das Ergebnis als aktive Nudge-Liste gesetzt

#### Scenario: Tab ist im Hintergrund

- **GIVEN** `document.hidden === true`
- **WHEN** das Intervall abläuft
- **THEN** wird kein Netzwerk-Request ausgelöst und die bestehende Nudge-Liste bleibt unverändert

---

### Requirement: Nudge-Snooze mit persistenter Unterdrückung

The system SHALL allow a user to dismiss a nudge and SHALL persist the snooze duration in
the database so that the same nudge does not reappear until the snooze period has elapsed,
even across page reloads.

#### Scenario: Nutzer schließt eine Nudge

- **GIVEN** eine aktive Nudge wird im UI angezeigt
- **WHEN** der Nutzer die Nudge schließt (Dismiss-Button oder Primäraktion)
- **THEN** wird die Nudge sofort aus der lokalen Liste entfernt
- **AND** `POST /api/assistant/dismiss` wird mit `nudgeId` und `snoozeSeconds=86400` aufgerufen
- **AND** in der Datenbanktabelle `assistant_nudge_dismissals` wird `snoozed_until = now() + 86400 seconds` gesetzt

#### Scenario: Nudge ist noch gesnoozed

- **GIVEN** ein Nutzer hat eine Nudge-ID gesnoozed und `snoozed_until` liegt in der Zukunft
- **WHEN** der Trigger bei der nächsten Evaluierung geprüft wird
- **THEN** gibt `isSnoozed(userSub, nudgeId)` `true` zurück und die Nudge wird nicht in die Response aufgenommen

---

### Requirement: Kontext-sensitiver Chat mit LLM-Fallback

The system SHALL send chat messages to an LLM (Anthropic Claude) when an API key is
configured, and SHALL fall back to deterministic keyword search over static help content
when no API key is available, ensuring the assistant remains functional in dev environments
without credentials.

#### Scenario: Chat mit LLM und Buchpassagen (RAG aktiv)

- **GIVEN** ein Nutzer sendet eine Frage im Chat mit aktiviertem `useBooks`-Toggle
- **WHEN** der Server `assistantChat` aufruft
- **THEN** werden bis zu 4 semantisch ähnliche Buchpassagen (Schwellenwert 0,62) aus den Coaching-Kollektionen abgerufen
- **AND** die Passagen werden dem System-Prompt als `<Quellenpassagen>` beigefügt
- **AND** die Antwort enthält inline-Zitate `[1]`, `[2]` etc. wenn Passagen genutzt wurden
- **AND** die Quellreferenzen (`AssistantSource[]`) werden zusammen mit der Antwort zurückgegeben

#### Scenario: Chat ohne API-Key (Keyword-Fallback)

- **GIVEN** kein Anthropic-API-Key ist konfiguriert (`cfg.apiKey` ist leer)
- **WHEN** ein Nutzer eine Nachricht sendet
- **THEN** durchsucht das System `helpContent` mit dem Token-basierten Keyword-Index
- **AND** gibt bei Treffer (Score ≥ 1) eine formatierte Hilfe-Antwort zurück
- **AND** gibt bei keinem Treffer eine Liste verfügbarer Hilfebereiche als Orientierung zurück

---

### Requirement: Zweistufige Aktionsausführung mit Bestätigungskarte

The system SHALL require explicit user confirmation before executing a proposed action,
presenting a summary card with target label and action description before committing
any side effect.

#### Scenario: LLM schlägt eine Aktion vor

- **GIVEN** der Assistent antwortet mit einer `ProposedAction` (z. B. Termin buchen)
- **WHEN** die Antwort im Chat gerendert wird
- **THEN** wird eine `AssistantConfirmCard` mit `targetLabel` und `summary` angezeigt
- **AND** der Nutzer sieht zwei Buttons: Bestätigen und Abbrechen

#### Scenario: Nutzer bestätigt die Aktion

- **GIVEN** eine Bestätigungskarte ist sichtbar
- **WHEN** der Nutzer auf Bestätigen klickt
- **THEN** wird `POST /api/assistant/execute` mit `actionId` und `payload` aufgerufen
- **AND** das Ergebnis (`result.message`) wird als neue Assistenten-Nachricht in den Chatverlauf eingefügt
- **AND** die Bestätigungskarte wird aus der Nachricht entfernt

#### Scenario: Nutzer bricht die Aktion ab

- **GIVEN** eine Bestätigungskarte ist sichtbar
- **WHEN** der Nutzer auf Abbrechen klickt
- **THEN** wird die Karte entfernt und eine neutrale Bestätigungsnachricht (`OK, lasse ich.`) erscheint im Chat

---

### Requirement: Portal-Trigger für Terminerinnerungen und Dokumente

The system SHALL proactively notify portal users about upcoming sessions (24h and 1h
windows), unread coach messages, pending questionnaires, and open document signatures
by evaluating the corresponding database triggers on every nudge poll.

#### Scenario: Termin in 24 Stunden

- **GIVEN** ein Klient hat ein `scheduled`-Meeting zwischen `now() + 23h` und `now() + 25h`
- **WHEN** der `portal-session-24h`-Trigger evaluiert wird
- **THEN** wird eine Nudge mit Terminzeitpunkt und dem CTA „Vorbereiten?" erzeugt

#### Scenario: Offene Dokumentenunterschrift

- **GIVEN** ein Klient hat ein `document_assignment` mit `status = 'pending'`
- **WHEN** der `portal-signature-pending`-Trigger evaluiert wird
- **THEN** wird eine Nudge mit Dokumententitel und dem CTA „Zeig mir das Dokument" erzeugt

#### Scenario: Tabelle nicht vorhanden (Fail-soft)

- **GIVEN** die Tabelle `document_assignments` existiert noch nicht (neues Deployment)
- **WHEN** der Trigger eine Datenbankabfrage ausführt
- **THEN** wird der PostgreSQL-Fehlercode `42P01` abgefangen und eine einmalige `console.warn` ausgegeben
- **AND** der Trigger gibt `null` zurück ohne den gesamten Nudge-Endpoint zum Absturz zu bringen

---

### Requirement: Admin-Trigger für Tagesbriefing und Echtzeit-Events

The system SHALL surface a morning briefing to the admin on the dashboard route
(once per day via snooze), and SHALL fire real-time nudges for imminent meetings,
newly submitted questionnaires, and received payments.

#### Scenario: Morgen-Briefing auf dem Dashboard

- **GIVEN** der Admin öffnet `/admin` oder `/admin/dashboard` und es gibt heute Termine oder offene Tickets
- **WHEN** der `admin-morning-briefing`-Trigger evaluiert wird
- **THEN** wird eine Nudge mit Tagesübersicht (Anzahl Meetings, offene Tickets) angezeigt
- **AND** nach dem Schließen wird die Nudge für 24 Stunden nicht mehr angezeigt

#### Scenario: Meeting startet in 5 Minuten

- **GIVEN** ein `scheduled`-Meeting liegt im Fenster `now()` bis `now() + 6 minutes`
- **WHEN** der `admin-meeting-imminent`-Trigger evaluiert wird
- **THEN** wird eine Nudge mit Klientenname und dem CTA „Beitreten" erzeugt

---

### Requirement: Sidekick-Panel-Navigation mit kontextabhängigem Menü

The system SHALL render a role-aware home menu in the Sidekick panel that shows
admin-exclusive views (Tickets, Postfach, Pipeline, Cockpit, Final Grilling) only
to admin users, and SHALL display numeric badges for pending items on the corresponding
menu entries.

#### Scenario: Admin-Nutzer sieht vollständiges Menü

- **GIVEN** der Sidekick wird mit `helpContext = 'admin'` gemountet
- **WHEN** die `SidekickHome`-Komponente rendert
- **THEN** sind alle 11 Menüpunkte sichtbar (Tickets, Postfach, Pipeline, Cockpit, Final Grilling, Fragebögen, Feedback, Agent-Anleitung, Lernpfad, Mediaviewer, Hilfe)

#### Scenario: Portal-Nutzer sieht reduziertes Menü ohne Admin-Bereiche

- **GIVEN** der Sidekick wird mit `helpContext = 'portal'` gemountet
- **WHEN** die `SidekickHome`-Komponente rendert
- **THEN** sind Admin-exklusive Einträge (Tickets, Postfach, Pipeline, Cockpit, Final Grilling) nicht sichtbar

#### Scenario: Badge für offene Fragebögen

- **GIVEN** `pendingQuestionnaires = 3`
- **WHEN** der Menüeintrag „Fragebögen" gerendert wird
- **THEN** wird ein Brass-Badge mit dem Wert `3` neben dem Eintrag angezeigt
- **AND** Badges größer als 99 werden auf `99` gekappt

---

### Requirement: Lernpfad-Banner und Aufmerksamkeitspunkt am FAB

The system SHALL display a contextual learning-progress banner in the Sidekick home
and SHALL show an attention dot on the floating action button when the user has a
partially completed learning path, but only when no numeric badge already occupies
the FAB corner.

#### Scenario: Lernpfad teilweise abgeschlossen

- **GIVEN** `summary = { done: 3, total: 10 }`
- **WHEN** `decideBanner(summary)` aufgerufen wird
- **THEN** gibt die Funktion `{ kind: 'continue', label: 'Weiter lernen · 3/10', cta: true }` zurück
- **AND** im Panel wird ein klickbarer Banner angezeigt, der zu `/portal/loslernen` navigiert

#### Scenario: Aufmerksamkeitspunkt nur ohne Zahlen-Badge

- **GIVEN** `helpContext = 'portal'`, `summary = { done: 2, total: 5 }`, `hasNumericBadge = false`
- **WHEN** `shouldShowLearnDot(summary, helpContext, hasNumericBadge)` aufgerufen wird
- **THEN** gibt die Funktion `true` zurück und der FAB zeigt den Lern-Dot

#### Scenario: Kein Dot bei vorhandenem Zahlen-Badge

- **GIVEN** `hasNumericBadge = true`
- **WHEN** `shouldShowLearnDot(summary, 'portal', true)` aufgerufen wird
- **THEN** gibt die Funktion `false` zurück, da FAB-Ecke bereits belegt ist

---

### Requirement: ClaudeSessionAgent Textantwort und API-Key-Pflicht

The system SHALL return a text response directly from the Claude API when the model responds
with `stop_reason: 'end_turn'` and a `text` content block, and SHALL throw an error mentioning
`ANTHROPIC_API_KEY` when neither `kiConfig.apiKey` nor the environment variable is set.

#### Scenario: Claude gibt Textantwort zurück

- **GIVEN** ein `ClaudeSessionAgent` ist instanziiert und `kiConfig.apiKey = 'test-key'`
- **WHEN** `agent.generate(opts)` aufgerufen wird und die Anthropic-API `{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Claude-Antwort' }] }` zurückgibt
- **THEN** ist `result.aiResponse` gleich `'Claude-Antwort'`
- **AND** `result.provider` ist `'claude'`

#### Scenario: Fehlender API-Key wirft Fehler

- **GIVEN** `kiConfig.apiKey` ist `null` und `process.env.ANTHROPIC_API_KEY` ist nicht gesetzt
- **WHEN** `agent.generate(opts)` aufgerufen wird
- **THEN** wird ein Fehler geworfen, dessen Meldung den Begriff `ANTHROPIC_API_KEY` enthält

---

### Requirement: ClaudeSessionAgent Tool-Loop-Limit

The system SHALL execute at most a fixed number of tool-call rounds (MAX_TOOL_ROUNDS) in the
`ClaudeSessionAgent`, stop the loop when the limit is reached, and return the last available
text response — or an empty string if no text response was ever produced.

#### Scenario: Tool-Loop endet nach 3 Runden mit Textantwort

- **GIVEN** die Anthropic-API antwortet dreimal mit `stop_reason: 'tool_use'` und beim vierten Aufruf mit `stop_reason: 'end_turn'` und Text `'Finale Antwort'`
- **WHEN** `agent.generate(opts)` aufgerufen wird
- **THEN** ist `result.aiResponse` gleich `'Finale Antwort'`
- **AND** `messages.create` wurde genau 4-mal aufgerufen

#### Scenario: Tool-Loop läuft bis MAX_TOOL_ROUNDS ohne Textantwort

- **GIVEN** die Anthropic-API antwortet bei jedem Aufruf mit `stop_reason: 'tool_use'` und produziert niemals einen `text`-Block
- **WHEN** `agent.generate(opts)` aufgerufen wird
- **THEN** wird der Loop nach MAX_TOOL_ROUNDS beendet und `result.aiResponse` ist ein String (ggf. leer), ohne dass ein Fehler geworfen wird

---

### Requirement: LegacySessionAgent Chat-Completions mit History-Prepend

The system SHALL call the provider's chat completion API with the session history prepended
as conversation turns (system message first, then alternating user/assistant), and SHALL
return the provider name alongside the text response.

#### Scenario: OpenAI-Anfrage mit korrekter Nachrichten-Reihenfolge

- **GIVEN** ein `LegacySessionAgent` wird mit `provider = 'openai'` und einer History von einem user/assistant-Paar aufgerufen
- **WHEN** `agent.generate(opts)` aufgerufen wird
- **THEN** wird `chat.completions.create` mit messages in der Reihenfolge `[system, user(hist), assistant(hist), user(current)]` aufgerufen
- **AND** `result.aiResponse` enthält den Inhalt aus `choices[0].message.content`
- **AND** `result.provider` ist `'openai'`

#### Scenario: Mistral-Anfrage mit korrekter Nachrichten-Reihenfolge

- **GIVEN** ein `LegacySessionAgent` wird mit `provider = 'mistral'` konfiguriert
- **WHEN** `agent.generate(opts)` aufgerufen wird
- **THEN** wird `chat.complete` mit der History als zweites und drittes Element der messages-Liste aufgerufen
- **AND** `result.provider` ist `'mistral'`

---

### Requirement: LegacySessionAgent API-Key-Pflicht je Provider

The system SHALL throw an error referencing the provider-specific environment variable name
when the `kiConfig.apiKey` is null and no fallback environment variable is set.

#### Scenario: Fehlender OpenAI-Key wirft spezifischen Fehler

- **GIVEN** `kiConfig.apiKey` ist `null` und `process.env.OPENAI_API_KEY` ist nicht gesetzt
- **WHEN** `agent.generate(opts)` mit `provider = 'openai'` aufgerufen wird
- **THEN** wird ein Fehler geworfen, dessen Meldung `'OPENAI_API_KEY'` enthält

---

### Requirement: Session-Agent-Factory-Routing und OpenAICompatibleSessionAgent RAG-Injection
<!-- baseline aus Codebase-Analyse am 2026-07-15 (T001869) — dokumentiert shipped Verhalten aus feature/lmstudio-session-pgvector -->

The factory (`session-agent-factory.ts`) SHALL route providers to session agents as follows: `claude` → `ClaudeSessionAgent` (Anthropic SDK, tool-based pgvector retrieval, supports custom baseURL); every `custom_*` provider plus `lumo`, `deepseek`, `anthropic`, `local-cluster`, `local-lmstudio`, `local-ollama` → `OpenAICompatibleSessionAgent`; `openai` and `mistral` → `LegacySessionAgent` (no pgvector).

The `OpenAICompatibleSessionAgent` SHALL inject coaching knowledge before every LLM call: it calls `searchCoachingKnowledgeTool(assembledUserPrompt, 4)` and, when chunks are found, prepends a `## Coaching-Wissen` section to the effective system prompt. It calls the endpoint via the OpenAI SDK (Bearer auth from `kiConfig.apiKey`) and supports both `generate` and `stream`.

#### Scenario: Lokaler LM-Studio-Provider erhält pgvector-RAG

- **GIVEN** eine aktive `coaching.ki_config`-Zeile mit `provider = 'custom_lmstudio'` (oder z.B. `local-ollama`)
- **WHEN** ein Session-Schritt generiert wird
- **THEN** instanziiert die Factory `OpenAICompatibleSessionAgent`, ruft vor dem LLM-Call `searchCoachingKnowledgeTool` auf und webt gefundene Chunks als `## Coaching-Wissen` in den System-Prompt ein

#### Scenario: OpenAI/Mistral bleiben ohne RAG-Injection

- **GIVEN** eine aktive Config mit `provider = 'openai'` oder `'mistral'`
- **WHEN** die Factory aufgerufen wird
- **THEN** wird `LegacySessionAgent` zurückgegeben und kein pgvector-Retrieval durchgeführt

---

### Requirement: Session-History aus akzeptierten und übersprungenen Schritten

The system SHALL build a conversation history exclusively from steps with status `accepted`
or `skipped`, each represented as a user turn (prompt) followed by an assistant turn (response),
and SHALL exclude steps with status `generated` or `pending` as well as the current step N itself.

#### Scenario: Accepted- und Skipped-Schritte werden als Turns inkludiert

- **GIVEN** Session hat Schritt 1 (`status = 'accepted'`) und Schritt 2 (`status = 'skipped'`) mit je `aiPrompt` und `aiResponse`
- **WHEN** `buildSessionHistory(sessionId, 3)` aufgerufen wird
- **THEN** enthält das Ergebnis 4 Einträge: `[{role:'user', content: prompt1}, {role:'assistant', content: resp1}, {role:'user', content: prompt2}, {role:'assistant', content: resp2}]`

#### Scenario: Generated- und Pending-Schritte werden ausgeschlossen

- **GIVEN** Session hat nur einen Schritt mit `status = 'generated'`
- **WHEN** `buildSessionHistory(sessionId, 2)` aufgerufen wird
- **THEN** ist das Ergebnis ein leeres Array

---

### Requirement: getSessionStepTool Datenbankabfrage

The system SHALL return the step data (including `stepName` and `aiResponse`) with `found: true`
when a step exists in the database, and SHALL return `{ found: false }` when the requested
step number does not exist.

#### Scenario: Vorhandener Schritt wird gefunden

- **GIVEN** Schritt 1 der Session wurde als `accepted` in die Datenbank geschrieben
- **WHEN** `getSessionStepTool(sessionId, 1)` aufgerufen wird
- **THEN** ist `result.found` gleich `true`, `result.stepName` gleich `'Erstanamnese'` und `result.aiResponse` gleich `'antwort'`

#### Scenario: Nicht existierender Schritt gibt found=false zurück

- **GIVEN** Schritt 99 existiert nicht in der Datenbank
- **WHEN** `getSessionStepTool(sessionId, 99)` aufgerufen wird
- **THEN** ist `result.found` gleich `false`

---

### Requirement: draftSessionReportTool Report-Assemblierung

The system SHALL assemble a text representation of all accepted session steps (including
step name and AI response) for use as a report prompt, and SHALL return an error object
when no accepted steps exist for the given session.

#### Scenario: Kein accepted Step ergibt Fehler-Objekt

- **GIVEN** für eine Session existieren keine Schritte mit `status = 'accepted'`
- **WHEN** `draftSessionReportTool(sessionId, 'markdown')` aufgerufen wird
- **THEN** enthält das Ergebnis ein definiertes `error`-Feld

#### Scenario: Accepted Steps werden zu stepsText zusammengebaut

- **GIVEN** Session hat zwei accepted Schritte mit Namen `'S1'`/`'S2'` und Antworten `'r1'`/`'r2'`
- **WHEN** `draftSessionReportTool(sessionId, 'markdown')` aufgerufen wird
- **THEN** enthält `result.stepsText` den Schrittname `'S1'` und die Antwort `'r1'`

---

### Requirement: estimateTokens Heuristik

The system SHALL estimate the token count of a string as approximately 1 token per 4 characters.

#### Scenario: Token-Schätzung für bekannten String

- **GIVEN** ein String mit 16 Zeichen
- **WHEN** `estimateTokens(str)` aufgerufen wird
- **THEN** wird `4` zurückgegeben

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Sidekick FAB Accessibility and Presence
<!-- e2e: fa-51-sidekick-navigation.spec.ts -->

The system SHALL render a visible, accessible Floating Action Button (FAB) on every page that
carries the Sidekick, with `aria-expanded="false"` in the closed state.

#### Scenario: FAB ist auf der Homepage vorhanden und zugänglich *(E2E)*
- **GIVEN** ein Benutzer ruft die Homepage auf (`/`)
- **WHEN** die Seite vollständig geladen ist (`networkidle`)
- **THEN** ist der `button.fab` sichtbar und trägt das Attribut `aria-expanded="false"`

---

### Requirement: Sidekick Panel Open/Close via FAB and Keyboard
<!-- e2e: fa-51-sidekick-navigation.spec.ts -->

The system SHALL open the Sidekick drawer when the FAB is clicked (setting `aria-expanded="true"`
and `aria-hidden="false"` on the drawer), SHALL close it on a second FAB interaction, and SHALL
also close it when the user presses the Escape key.

#### Scenario: Sidekick öffnet sich beim FAB-Klick *(E2E)*
- **GIVEN** der FAB ist sichtbar und `aria-expanded="false"`
- **WHEN** der Nutzer auf den FAB klickt
- **THEN** wird `aria-expanded="true"` am FAB gesetzt
- **AND** das Drawer-Element `[aria-label="Sidekick"]` wechselt auf `aria-hidden="false"`

#### Scenario: Sidekick schließt sich beim zweiten FAB-Klick (via JS-Dispatch) *(E2E)*
- **GIVEN** der Sidekick ist geöffnet (`aria-expanded="true"`)
- **WHEN** ein `click`-Event via `dispatchEvent` direkt am FAB ausgelöst wird (da der offene Drawer den FAB überdeckt)
- **THEN** wechselt `aria-expanded` wieder auf `"false"`

#### Scenario: Sidekick schließt sich mit der Escape-Taste *(E2E)*
- **GIVEN** der Sidekick ist geöffnet
- **WHEN** der Nutzer die Escape-Taste drückt
- **THEN** wechselt `aria-expanded` am FAB auf `"false"`

---

### Requirement: sidekick:navigate CustomEvent für bekannte Views
<!-- e2e: fa-51-sidekick-navigation.spec.ts -->

The system SHALL accept a `sidekick:navigate` CustomEvent with a known `view` value (`grilling`,
`mediaviewer`) without throwing a JavaScript error; unknown views SHALL return `null` and produce
no navigation.

#### Scenario: Navigation zu View "grilling" löst keinen Fehler aus *(E2E)*
- **GIVEN** der Sidekick ist geöffnet
- **WHEN** `window.dispatchEvent(new CustomEvent('sidekick:navigate', { detail: { view: 'grilling', jumpTo: null } }))` aufgerufen wird
- **THEN** wird kein JavaScript-Fehler geworfen

#### Scenario: Navigation zu View "mediaviewer" löst keinen Fehler aus *(E2E)*
- **GIVEN** der Sidekick ist geöffnet
- **WHEN** `window.dispatchEvent(new CustomEvent('sidekick:navigate', { detail: { view: 'mediaviewer', jumpTo: null } }))` aufgerufen wird
- **THEN** wird kein JavaScript-Fehler geworfen

---

### Requirement: Agent-Anleitung — Titel und Themen-Gruppen
<!-- e2e: agent-guide-walkthrough.spec.ts -->

The system SHALL render the Agent-Anleitung view inside the Sidekick panel with a visible title,
all configured theme groups, and all goal/tool cards collapsed by default.

#### Scenario: Agent-Anleitung zeigt Titel beim Öffnen *(E2E)*
- **GIVEN** der Nutzer öffnet die Agent-Anleitung im Sidekick
- **WHEN** die Ansicht gerendert wird
- **THEN** enthält `.sk-title` den Text `"Agent-Anleitung"`

#### Scenario: Alle Themen-Gruppen vorhanden, Karten eingeklappt *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** die Komponente gerendert wird
- **THEN** ist die Anzahl der `.ag-group`-Elemente gleich der Anzahl konfigurierter Themen
- **AND** jede `.ag-card-head` hat `aria-expanded="false"`

---

### Requirement: Agent-Anleitung — Karten expandieren und kollabieren
<!-- e2e: agent-guide-walkthrough.spec.ts -->

The system SHALL expand an Agent-Anleitung card on click (making the prompt text visible) and
SHALL collapse it again on a second click.

#### Scenario: Karte lässt sich aus- und wieder einklappen *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Nutzer auf den Card-Header des ersten Ziels klickt (expandieren) und dann erneut klickt (einklappen)
- **THEN** ist `.ag-prompt-text` nach dem ersten Klick sichtbar und nach dem zweiten Klick ist `aria-expanded="false"` gesetzt

---

### Requirement: Agent-Anleitung — Volltextsuche mit Highlighting
<!-- e2e: agent-guide-walkthrough.spec.ts -->

The system SHALL activate search filtering after 3 characters are entered, display a match counter,
auto-expand matched cards, and highlight matching terms; it SHALL handle umlaut folding (e.g.
"aendern" → "ändern") and alias-based matches (e.g. "passwort" → Sicherheit card).

#### Scenario: Suche ab 3 Zeichen filtert und zeigt Treffer-Zähler *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Nutzer `"daten"` in `.ag-search-input` eingibt
- **THEN** zeigt `.ag-search-count` einen Text mit `"Treffer"`
- **AND** eine `.ag-card` mit dem Namen `"Datenbank"` ist sichtbar
- **AND** mindestens ein `.ag-hl`-Element (Highlighting) ist sichtbar

#### Scenario: Umlaut-Suche "aendern" findet Karte mit "ändern" *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Nutzer `"aendern"` eingibt
- **THEN** ist ein `.ag-name`-Element mit dem Text `"ändern"` sichtbar

#### Scenario: Alias-Suche "passwort" findet die Sicherheits-Karte *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Nutzer `"passwort"` eingibt
- **THEN** ist ein `.ag-name`-Element mit dem Text `"Passwort"` sichtbar

---

### Requirement: Agent-Anleitung — Achsen-Umschalter und Tier-Filter
<!-- e2e: agent-guide-walkthrough.spec.ts -->

The system SHALL allow switching the grouping axis to "Gefahr" (showing tier-based group labels)
and SHALL support filtering cards by danger tier (e.g. showing only `forbidden` cards with their
red-stop panels).

#### Scenario: Achsen-Umschalter auf "Gefahr" zeigt Tier-Gruppen *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Nutzer den Button `.ag-axis-btn` mit Text `"Gefahr"` klickt
- **THEN** ist ein `.ag-group-label` mit Text `"Niemals allein"` sichtbar

#### Scenario: Tier-Filter auf "Verboten" zeigt nur Forbidden-Karten *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet und der Tier-Filter ist auf `forbidden` gesetzt
- **WHEN** die erste Forbidden-Karte expandiert wird
- **THEN** ist `.ag-redstop` sichtbar
- **AND** `.ag-redstop-who` enthält den Text `"Patrick"`
- **AND** `.ag-copy` enthält den Text `"Rücksprache"`

---

### Requirement: Skill-Orchestrator Pre/Post Hook-Ausführung
<!-- bats: skill-orchestrator.bats -->

The system SHALL parse a skill YAML frontmatter and execute the pre-hooks (and only the pre-hooks)
when invoked with the `pre` argument, and the post-hooks (and only the post-hooks) when invoked
with `post`. Missing hook scripts SHALL be tolerated without aborting the remaining hooks.

#### Scenario: Orchestrator führt Pre-Hooks aus *(BATS)*
- **GIVEN** eine Skill-Datei mit `hooks.pre: [test-pre-hook]` und `hooks.post: [test-post-hook]`
- **WHEN** `skill-orchestrator.sh <skill> pre` aufgerufen wird
- **THEN** wird `pre-hook-executed` in der Ausgabe angezeigt
- **AND** `post-hook-executed` erscheint nicht in der Ausgabe

#### Scenario: Orchestrator führt Post-Hooks aus *(BATS)*
- **GIVEN** dieselbe Skill-Datei
- **WHEN** `skill-orchestrator.sh <skill> post` aufgerufen wird
- **THEN** wird `post-hook-executed` angezeigt und `pre-hook-executed` bleibt aus

#### Scenario: Fehlende Hook-Skripte werden toleriert *(BATS)*
- **GIVEN** die Skill-Datei enthält zusätzlich einen Hook `non-existent-hook`, für den kein Skript existiert
- **WHEN** `skill-orchestrator.sh <skill> pre` aufgerufen wird
- **THEN** wird der Prozess mit Exit-Code 0 beendet und die anderen Pre-Hooks werden trotzdem ausgeführt

---

### Requirement: Brainstorm-Extract-Choice — Letzte Nutzerentscheidung lesen
<!-- bats: brainstorm-extract-choice.bats -->

The system SHALL extract the last `click`-type choice from a session events file and return it
with exit code 0; it SHALL return exit code 1 when the events file is absent or contains no
`click`-type choice event.

#### Scenario: Letzter Choice-Event wird extrahiert *(BATS)*
- **GIVEN** eine Events-Datei mit zwei JSON-Zeilen (Choice A, dann Choice B)
- **WHEN** `brainstorm-extract-choice.sh <dir>` aufgerufen wird
- **THEN** wird `B` auf stdout ausgegeben und Exit-Code ist 0

#### Scenario: Fehlende Events-Datei ergibt Exit-Code 1 *(BATS)*
- **GIVEN** das Verzeichnis enthält keine Events-Datei
- **WHEN** `brainstorm-extract-choice.sh <dir>` aufgerufen wird
- **THEN** ist der Exit-Code 1

#### Scenario: Datei ohne Choice-Events ergibt Exit-Code 1 *(BATS)*
- **GIVEN** die Events-Datei enthält nur einen `scroll`-Event (kein `click`)
- **WHEN** `brainstorm-extract-choice.sh <dir>` aufgerufen wird
- **THEN** ist der Exit-Code 1

---

### Requirement: ai_call_log Tabelle

The system SHALL provide `website/migrations/20260621_create_ai_call_log.sql` creating a `public.ai_call_log` table with columns `id, ts, workflow, model, prompt_tokens, completion_tokens, latency_ms, error, user_sub, metadata` and indexes `ai_call_log_ts` (DESC) and `ai_call_log_workflow` (workflow, ts DESC). The migration SHALL be idempotent (`IF NOT EXISTS`).

### Requirement: ai-metrics Pure Module

The system SHALL provide `website/src/lib/ai-metrics.ts` exporting two functions: `withAiMetrics(workflow, fn, modelHint?)` for Anthropic-Form call-sites (auto-extracts `result.usage.{input,output}_tokens` and `result.model`), and `logAiCall(metrics)` for non-Anthropic call-sites (RAG/embeddings). Both SHALL be fire-and-forget (Insert-Fehler werden auf stderr geloggt, Exit 0). `ai-metrics.ts` SHALL NOT import `assistant/llm.ts` (no import cycles).

#### Scenario: withAiMetrics extrahiert usage aus Anthropic-Result

- **GIVEN** `messages.create()` returns `{ usage: { input_tokens: 100, output_tokens: 50 }, model: 'claude-sonnet-4-5' }`
- **WHEN** `await withAiMetrics('coaching-chat', () => messages.create(...))` aufgerufen wird
- **THEN** wird ein `ai_call_log`-Row mit `workflow='coaching-chat'`, `prompt_tokens=100`, `completion_tokens=50`, `model='claude-sonnet-4-5'`, `error=NULL` geschrieben
- **AND** das Original-Result wird rethrown

#### Scenario: Fehlerhafter Insert bricht AI-Call nicht ab

- **GIVEN** der `ai_call_log` Insert wirft einen DB-Fehler
- **WHEN** `await withAiMetrics(...)` läuft
- **THEN** wird der Fehler auf stderr geloggt (nicht geworfen)
- **AND** `messages.create()`'s Result/Error propagiert unverändert

### Requirement: Admin-Endpoint für AI-Quality Aggregation

The system SHALL provide `GET /api/admin/ai-quality` (admin-only via `getSession` + `isAdmin` pattern, 401 ohne Admin-Session) that aggregates `ai_call_log` rows into `{ health: {ok, total, errors_24h, p95_latency_ms}, last24h: { calls, tokens, cost_usd, by_workflow: [...] }, recentErrors: [...] }`. Cost SHALL be computed at query time (tokens × model price/1k).

### Requirement: AiQualitySidekickView Svelte-Komponente

The system SHALL provide `website/src/components/assistant/AiQualitySidekickView.svelte` rendering health indicator, 24h summary, cost chart, and recent error list. The view SHALL be registered as a Sidekick view in `sidekick-nudge.ts` (`'ai-quality'` to `View` union + `KNOWN_VIEWS`).

#### Scenario: Admin sieht AI-Quality-View im Sidekick

- **GIVEN** ein Admin ist eingeloggt
- **WHEN** er im Sidekick "KI-Qualität" auswählt
- **THEN** zeigt die View die aggregierten Metriken der letzten 24h
- **AND** der Health-Indikator reflektiert `error_rate < 5%` als grün, sonst gelb/rot

---

### Requirement: SidekickHome.svelte ohne Tickets/Inbox/Pipeline-Items

The system SHALL NOT render the SidekickHome items for `tickets`, `inbox`, `pipeline` or `loslernen`. The remaining items (coaching, source, container, ai-quality) SHALL be renumbered 01-N in the order they appear.

### Requirement: PortalSidekick.svelte ohne View-Branches für entfernte Views

The system SHALL NOT include the `tickets`, `inbox`, or `pipeline` view branches in `PortalSidekick.svelte`. The `View` union, `titleMap`, and `decideBanner`/`shouldShowLearnDot` references SHALL be cleaned up accordingly. The `learning/summary`, `tickets`, and `inbox` API fetches SHALL be removed (only `container-count` remains).

### Requirement: sidekick-nudge.ts ohne Banner/LearnDot

The system SHALL NOT export `decideBanner`, `BannerDecision`, `BannerInput`, or `shouldShowLearnDot` from `website/src/lib/assistant/sidekick-nudge.ts`. `SidekickView` and `KNOWN_VIEWS` SHALL be reduced to the post-cleanup view set.

### Requirement: mediaviewer-bridge.ts Session-Protokoll

The system SHALL extend `HostInbound.setMode.mode` to accept `'brainstorm'`, and SHALL add `sessionStarted` and `sessionProgress` events to `HostOutbound` in `mediaviewer-bridge.ts`. The `buildSetModeMessage` and `parseOutbound` helpers SHALL be updated accordingly, with tests covering the new cases.

#### Scenario: Removed View wird im Sidekick nicht gerendert

- **GIVEN** `tickets`, `inbox`, `pipeline` sind aus `KNOWN_VIEWS` entfernt
- **WHEN** PortalSidekick mounted
- **THEN** ist keiner der drei Einträge in der Sidekick-Item-Liste sichtbar
- **AND** `grep -nE 'progressSub|summary|banner|pendingTickets|pendingInbox|loslernen' website/src/components/assistant/SidekickHome.svelte` ist leer

#### Scenario: Session-Protokoll für Brainstorm-View

- **GIVEN** die Mediaviewer ist im `brainstorm`-Modus
- **WHEN** die Brainstorm-Session startet
- **THEN** sendet die Bridge `sessionStarted` mit Session-Metadaten
- **AND** sendet periodisch `sessionProgress` Updates
