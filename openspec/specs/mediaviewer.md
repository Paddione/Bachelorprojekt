# mediaviewer

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Der Mediaviewer ist ein iframe-eingebettetes SPA-Widget (`mediaviewer-widget`), das im
Admin-Sidekick der Website läuft. Es wird über einen dedizierten Keycloak-OIDC-OAuth2-Proxy
authentifiziert und kommuniziert ausschließlich per `postMessage`-Bridge mit dem einbettenden
Fenster. Das Widget unterstützt zwei Modi: **video** (VideoVault-Hilfsvideos) und
**grilling** (Final-Grilling-Fragebogen für ein Ticket).

---

### Requirement: OIDC-Authentifizierungs-Gate

The system SHALL require a valid Keycloak OIDC session before serving any mediaviewer
content, and SHALL redirect unauthenticated requests to the Keycloak login page via the
`oauth2-proxy-mediaviewer` sidecar.

#### Scenario: Authentifizierter Aufruf

- **GIVEN** ein Nutzer mit gültiger Keycloak-Session öffnet `mediaviewer.<domain>`
- **WHEN** der oauth2-proxy den Request prüft
- **THEN** wird die Anfrage an das `mediaviewer-widget`-Backend weitergeleitet und das SPA ausgeliefert

#### Scenario: Nicht authentifizierter Aufruf

- **GIVEN** ein Nutzer ohne Session öffnet `mediaviewer.<domain>`
- **WHEN** der oauth2-proxy den Request prüft
- **THEN** wird der Nutzer zur Keycloak-Login-URL umgeleitet (`--skip-provider-button=true`, kein Zwischendialog)

---

### Requirement: iframe-Embedding mit CSP-gesteuerter Herkunftsbeschränkung

The system SHALL allow the mediaviewer widget to be embedded as an iframe exclusively by
`web.<domain>` and SHALL enforce this via the `Content-Security-Policy: frame-ancestors`
response header, with `X-Frame-Options` cleared to prevent legacy header conflicts.

#### Scenario: Einbettung durch erlaubten Parent

- **GIVEN** `MediaviewerPanel.svelte` auf `web.<domain>` bettet `mediaviewer.<domain>/embed.html` als iframe ein
- **WHEN** der Browser die Response-Header des Widget-Servers auswertet
- **THEN** ist `X-Frame-Options` leer und `Content-Security-Policy: frame-ancestors 'self' https://web.<domain>` gesetzt
- **AND** das iframe wird erfolgreich gerendert

#### Scenario: Einbettungsversuch durch fremde Seite

- **GIVEN** eine Seite auf einer anderen Domain bettet `mediaviewer.<domain>` als iframe ein
- **WHEN** der Browser die CSP-Header auswertet
- **THEN** blockiert der Browser das iframe-Rendering aufgrund der `frame-ancestors`-Beschränkung

---

### Requirement: postMessage-Bridge — Inbound-Kommandos

The system SHALL accept control messages from the parent window exclusively when the
message origin matches the configured `VITE_ALLOWED_PARENT_ORIGINS` list, and SHALL
ignore messages from all other origins.

Die unterstützten Inbound-Nachrichtentypen sind:
`setVideos`, `playVideo`, `play`, `pause`, `seek`, `setMode`, `setGrillingData`.

#### Scenario: Valide Nachricht vom erlaubten Parent

- **GIVEN** das Widget läuft in einem iframe von `web.<domain>` (erlaubter Origin)
- **WHEN** der Parent ein `setVideos`-PostMessage mit einem Array von VideoSource-Objekten sendet
- **THEN** aktualisiert das Widget seine interne Video-Liste und stellt sie im HelpVideoPicker dar

#### Scenario: Nachricht von unbekanntem Origin

- **GIVEN** ein Script auf einer fremden Seite sendet eine `play`-Nachricht an das Widget
- **WHEN** der Bridge-Handler den `event.origin` prüft
- **THEN** wird die Nachricht stillschweigend ignoriert (kein Fehler, kein State-Change)

---

### Requirement: postMessage-Bridge — Outbound-Events

The system SHALL emit typed outbound messages to `window.parent` when der Nutzer im Widget
interagiert, damit der Parent-Frame reagieren kann.

Die unterstützten Outbound-Nachrichtentypen sind:
`select`, `progress`, `ended`, `error`, `grillingAnswer`, `grillingDismiss`, `grillingComplete`.

#### Scenario: Video-Auswahl im Widget

- **GIVEN** das Widget läuft im Modus `video` mit einer geladenen Video-Liste
- **WHEN** der Nutzer ein Video im HelpVideoPicker auswählt
- **THEN** sendet das Widget ein `{ type: 'select', id: '<videoId>' }`-PostMessage an `window.parent`

#### Scenario: Grilling-Antwort abgeschickt

- **GIVEN** das Widget läuft im Modus `grilling` mit geladenen Fragen
- **WHEN** der Nutzer eine Antwort auf eine Frage speichert
- **THEN** sendet das Widget ein `{ type: 'grillingAnswer', questionId: '...', answer: '...' }`-PostMessage an `window.parent`

---

### Requirement: Dualer Betriebsmodus (video / grilling)

The system SHALL support two distinct display modes — `video` for VideoVault help content
and `grilling` for ticket qualification questionnaires — and SHALL switch modes reactively
when a `setMode` message is received from the parent.

#### Scenario: Wechsel in den Grilling-Modus

- **GIVEN** das Widget läuft initial im Modus `video`
- **WHEN** der Parent ein `{ type: 'setMode', mode: 'grilling', ticketId: 'T000123' }` sendet, gefolgt von `setGrillingData`
- **THEN** blendet das Widget die Video-Ansicht aus und zeigt die `GrillingSessionView` mit den übergebenen Fragen und Hinweisen

#### Scenario: Kein Grilling-Inhalt im Video-Modus

- **GIVEN** das Widget läuft im Modus `video`
- **WHEN** keine `setGrillingData`-Nachricht eingegangen ist
- **THEN** zeigt das Widget ausschließlich den VideoVault-Player und den HelpVideoPicker

---

### Requirement: Videovault-Host-Rewriting

The system SHALL rewrite VideoVault video URLs from the dev placeholder hostname
(`videovault.localhost`) to the configured production or environment-specific
`videovaultHost` before passing them to the Widget, so that videos play in all environments
without hardcoded hostnames.

#### Scenario: URL-Rewriting in Produktion

- **GIVEN** `help-videos.json` enthält eine URL mit dem Hostname `videovault.localhost`
- **WHEN** `resolveHelpVideos(videovaultHost)` mit dem produktiven Hostname aufgerufen wird
- **THEN** wird der Hostname in der URL durch den übergebenen `videovaultHost` ersetzt
- **AND** URLs mit anderen Hostnamen bleiben unverändert

#### Scenario: Invalide URL bleibt unverändert

- **GIVEN** `help-videos.json` enthält eine fehlerhaft formatierte URL
- **WHEN** `resolveHelpVideos` die URL verarbeitet
- **THEN** wird der Originaleintrag ohne Modifikation zurückgegeben (fail-safe)

---

### Requirement: Grilling-Antworten in der Admin-Persistenz

The system SHALL persist grilling answers written in the Widget back to the Ticket-API
via the parent host component (`GrillingSessionHost`), using PATCH requests to
`/api/admin/tickets/<id>` under the key `grilling_answers['final-grilling-v1']`.

#### Scenario: Einzelne Antwort speichern

- **GIVEN** `GrillingSessionHost` empfängt ein `onGrillingAnswer`-Event vom Widget
- **WHEN** der Handler ausgeführt wird
- **THEN** sendet er einen PATCH-Request an `/api/admin/tickets/<ticketId>` mit dem Body
  `{ grilling_answers: { 'final-grilling-v1': { <questionId>: <answer> } } }`

#### Scenario: API-Fehler beim Speichern

- **GIVEN** die Ticket-API antwortet mit einem HTTP-Fehler
- **WHEN** der PATCH-Request fehlschlägt
- **THEN** wird der Fehler still abgefangen (fail-soft) und das Widget bleibt bedienbar

---

### Requirement: Cache-Buster beim iframe-Laden

The system SHALL append a cache-busting query parameter to the `embed.html` iframe URL
so that Browsers keine alten Responses mit veralteten `X-Frame-Options`-Headern aus dem
HTTP-Cache verwenden.

#### Scenario: embed.html-URL enthält Cache-Buster

- **GIVEN** `MediaviewerPanel.svelte` wird mit einem `mediaviewerHost` initialisiert
- **WHEN** die `embedSrc`-Property berechnet wird
- **THEN** hat die URL die Form `https://<mediaviewerHost>/embed.html?v=<mediaviewerHost>`
- **AND** der Browser sendet bei jedem Mount einen Netzwerkrequest statt eine gecachte Response zu verwenden
