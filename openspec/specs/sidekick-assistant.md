# sidekick-assistant

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Das Sidekick-System ist der KI-gestützte In-App-Assistent und Nudge-Kanal der Website.
Es besteht aus zwei Schichten: einem proaktiven **Nudge-System** (kontextgebundene Push-Hinweise)
und einem reaktiven **Chat-Interface** mit optionaler RAG-Anreicherung aus Coaching-Büchern.
Das System kennt zwei Profile — `admin` (Coach) und `portal` (Klient) — mit strikt getrennten
Triggern, Aktionen und Seitenmenüs.

---

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
