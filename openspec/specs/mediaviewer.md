# mediaviewer

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Der Mediaviewer ist ein iframe-eingebettetes SPA-Widget (`mediaviewer-widget`), das im
Admin-Sidekick der Website läuft. Es wird über einen dedizierten Keycloak-OIDC-OAuth2-Proxy
authentifiziert und kommuniziert ausschließlich per `postMessage`-Bridge mit dem einbettenden
Fenster. Das Widget unterstützt zwei Modi: **video** (VideoVault-Hilfsvideos) und
**grilling** (Final-Grilling-Fragebogen für ein Ticket).

---

## Requirements

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

---

### Requirement: Bridge-Inbound-Envelope-Konstruktion (setVideos / setMode / setGrillingData)

The system SHALL build correctly typed inbound postMessage envelopes via dedicated builder
functions, so that the parent window can assemble protocol-conformant control messages
without manual object construction.

#### Scenario: setVideos-Envelope korrekt geformt

- **GIVEN** ein Array von `HelpVideo`-Objekten liegt vor
- **WHEN** `buildSetVideosMessage(videos)` aufgerufen wird
- **THEN** gibt die Funktion ein Objekt `{ type: 'setVideos', videos }` zurück, das exakt dem erwarteten Envelope-Format entspricht

#### Scenario: setMode-Envelope mit optionaler ticketId

- **GIVEN** der Parent möchte in den Modus `grilling` oder `brainstorm` wechseln
- **WHEN** `buildSetModeMessage('grilling', 'T000001')` aufgerufen wird
- **THEN** gibt die Funktion `{ type: 'setMode', mode: 'grilling', ticketId: 'T000001' }` zurück
- **AND** ein Aufruf ohne ticketId (z. B. `buildSetModeMessage('video')`) gibt `{ type: 'setMode', mode: 'video' }` zurück, ohne `ticketId`-Feld

---

### Requirement: Bridge-Outbound-Parsing mit strikter Typprüfung

The system SHALL parse raw postMessage payloads from the widget with strict field validation
via `parseOutbound`, returning a typed outbound message object on success or `null` on any
schema violation, so that the parent can safely pattern-match on outbound events.

#### Scenario: Valide Outbound-Nachrichten werden erkannt

- **GIVEN** das Widget sendet eine wohlgeformte Nachricht, z. B. `{ type: 'select', id: 'v1' }` oder `{ type: 'progress', sec: 4.2 }`
- **WHEN** `parseOutbound(payload)` aufgerufen wird
- **THEN** gibt die Funktion das typisierte Objekt unverändert zurück

#### Scenario: Ungültige oder unvollständige Payloads werden abgewiesen

- **GIVEN** ein Payload hat einen unbekannten `type` (z. B. `setVideos`, `setMode`), fehlt ein Pflichtfeld (z. B. `select` ohne `id`), ist kein Objekt (`null`, String) oder enthält einen falsch typisierten Wert (z. B. `sec: 'x'`)
- **WHEN** `parseOutbound(payload)` aufgerufen wird
- **THEN** gibt die Funktion `null` zurück und verursacht keinerlei Exception

---

### Requirement: Session-Events im Outbound-Protokoll (sessionStarted / sessionProgress)

The system SHALL accept `sessionStarted` and `sessionProgress` outbound messages from the
widget, validating that required fields are present and numeric fields are of type number,
so that brainstorm-session lifecycle events can be forwarded to the parent reliably.

#### Scenario: Valide sessionStarted- und sessionProgress-Nachrichten

- **GIVEN** das Widget sendet `{ type: 'sessionStarted', sessionType: 'brainstorm-v1', sessionId: 's1' }` oder ohne optionale `sessionId`
- **WHEN** `parseOutbound(payload)` aufgerufen wird
- **THEN** wird das typisierte Objekt zurückgegeben; `sessionId` ist optional und darf fehlen
- **AND** eine `sessionProgress`-Nachricht mit numerischen `answeredCount` und `totalCount` wird ebenfalls akzeptiert

#### Scenario: sessionStarted ohne sessionType und sessionProgress mit nicht-numerischem Count

- **GIVEN** ein Payload `{ type: 'sessionStarted' }` ohne `sessionType`, oder `{ type: 'sessionProgress', sessionType: 'b', answeredCount: 'x', totalCount: 9 }` mit nicht-numerischem `answeredCount`
- **WHEN** `parseOutbound(payload)` aufgerufen wird
- **THEN** gibt die Funktion `null` zurück

---

### Requirement: ComfyUI-Client — Bild-Upload und Workflow-Ausführung

The system SHALL provide a `ComfyUI`-Client mit den Operationen `uploadImage` und
`queuePrompt`, die jeweils gegen die REST-API des ComfyUI-Gateway arbeiten und den
Dateinamen bzw. die `prompt_id` der Antwort zurückliefern.

#### Scenario: Bild-Upload gibt Dateinamen zurück

- **GIVEN** ein ArrayBuffer mit Bilddaten und ein Dateiname sind vorhanden
- **WHEN** `uploadImage(baseUrl, buffer, filename)` aufgerufen wird
- **THEN** wird ein POST-Request an `<baseUrl>/upload/image` gesendet
- **AND** die Funktion gibt den von ComfyUI vergebenen `name` (Dateinamen) aus der JSON-Antwort zurück

#### Scenario: Workflow-Queue gibt prompt_id zurück

- **GIVEN** ein serialisiertes Workflow-Objekt steht bereit
- **WHEN** `queuePrompt(baseUrl, workflow)` aufgerufen wird
- **THEN** wird ein POST-Request an `<baseUrl>/prompt` gesendet
- **AND** die Funktion gibt die `prompt_id` aus der Antwort zurück

---

### Requirement: ComfyUI-Client — History-Polling und GLB-Download

The system SHALL provide `getHistory`, `findGlbOutput`, and `downloadOutput` to poll job
completion status and retrieve the generated GLB asset from ComfyUI's output store.

#### Scenario: History-Polling gibt leeres Objekt zurück, wenn Job noch wartet

- **GIVEN** ein ComfyUI-Job mit einer bekannten `prompt_id` ist noch in der Queue
- **WHEN** `getHistory(baseUrl, promptId)` abgefragt wird
- **THEN** gibt die Funktion ein leeres Objekt `{}` zurück, was bedeutet dass der Job noch nicht abgeschlossen ist

#### Scenario: findGlbOutput findet erste GLB-Datei in den Outputs

- **GIVEN** die Outputs eines abgeschlossenen ComfyUI-Jobs enthalten einen Knoten mit `glb`-Array
- **WHEN** `findGlbOutput(outputs)` aufgerufen wird
- **THEN** gibt die Funktion den Dateinamen der ersten GLB-Ausgabe zurück
- **AND** sind keine GLB-Outputs vorhanden, gibt die Funktion `null` zurück

---

### Requirement: Rigger-Client — GLB-Rigging via Blender

The system SHALL provide a `rigGlb` function that POSTs a raw GLB buffer to the Rigger
service's `/rig?method=blender` endpoint via `multipart/form-data` and returns the rigged
GLB as an `ArrayBuffer`.

#### Scenario: Erfolgreiches Rigging gibt geriegtes GLB zurück

- **GIVEN** ein GLB-ArrayBuffer und ein Dateiname liegen vor
- **WHEN** `rigGlb(baseUrl, glbBuffer, filename)` aufgerufen wird
- **THEN** wird ein POST-Request an `<baseUrl>/rig?method=blender` mit einem `FormData`-Body gesendet
- **AND** die Funktion gibt den Antwort-ArrayBuffer des geriegten Modells zurück

#### Scenario: Rigger-Fehler wird als Exception weitergereicht

- **GIVEN** der Rigger-Service antwortet mit HTTP 500
- **WHEN** `rigGlb(...)` aufgerufen wird
- **THEN** wirft die Funktion eine Exception mit dem Text `'Rigger failed: 500'`

---

### Requirement: 3D-Pipeline-Zustandsmaschine (generating → rigging → uploading → done)

The system SHALL advance a 3D generation job through the stages `generating`, `rigging`,
`uploading`, and `done` in sequence via `finaliseJob`, persisting each stage transition via
`updateJobStage`, and registering the resulting asset in the database registry upon
completion.

#### Scenario: Vollständiger Pipeline-Durchlauf in einem Tick

- **GIVEN** ComfyUI meldet den Job als erfolgreich abgeschlossen (GLB vorhanden), der Rigger antwortet mit einem geriegten Modell, und Brett akzeptiert den Upload und gibt eine `skin_id` zurück
- **WHEN** `finaliseJob(jobId, promptId, figureSlug)` aufgerufen wird
- **THEN** werden die Stages `['generating', 'rigging', 'uploading', 'done']` in dieser Reihenfolge persistiert
- **AND** genau ein Eintrag wird in der Asset-Registry-Datenbank angelegt

#### Scenario: ComfyUI noch in Queue — Pipeline bleibt in Stage generating

- **GIVEN** ComfyUI gibt für den `prompt_id` eine leere History zurück (Job noch nicht fertig)
- **WHEN** `finaliseJob(jobId, promptId, figureSlug)` aufgerufen wird
- **THEN** wird ausschließlich Stage `generating` persistiert, ohne Fortschritt zu Rigging oder Uploading

---

### Requirement: 3D-Pipeline-Fehlerbehandlung (ComfyUI / Rigger / Brett)

The system SHALL set the job stage to `error` with a descriptive `error_msg` when any
pipeline step fails — whether ComfyUI reports an error status, the Rigger returns a
non-2xx response, or Brett's validation rejects the GLB with a 422.

#### Scenario: ComfyUI-Fehler führt zu Stage error

- **GIVEN** ComfyUI antwortet mit `status_str: 'error'` für den Job
- **WHEN** `finaliseJob(...)` den Status auswertet
- **THEN** wird Stage `error` persistiert

#### Scenario: Rigger-500 und Brett-422 führen zu error mit beschreibender Fehlermeldung

- **GIVEN** der Rigger antwortet mit HTTP 500, oder Brett antwortet mit HTTP 422
- **WHEN** `finaliseJob(...)` den jeweiligen Schritt ausführt
- **THEN** wird Stage `error` mit einem `extra.error_msg` persistiert, der jeweils `'Rigging failed'` bzw. `'Brett upload failed'` enthält

---

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the mediaviewer specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/mediaviewer.bats` file exists
- **WHEN** `bats tests/spec/mediaviewer.bats` runs
- **THEN** the smoke test exits successfully

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: MEDIAVIEWER_HOST-Definition im Prod-Domain-ConfigMap
<!-- bats: mediaviewer-host-durability.bats -->

The system SHALL define `MEDIAVIEWER_HOST` explicitly in `prod/configmap-domains.yaml` so
that the strategic-merge patch over the base ConfigMap does not leave the live domain
config with the dev placeholder value `mediaviewer.localhost` after a production deploy.

#### Scenario: Prod-ConfigMap enthält MEDIAVIEWER_HOST *(BATS)*

- **GIVEN** `prod/configmap-domains.yaml` liegt vor (Prod-Overlay-Patch)
- **WHEN** die Datei nach dem Schlüssel `MEDIAVIEWER_HOST` durchsucht wird
- **THEN** ist der Schlüssel vorhanden — der Merge überschreibt den Dev-Wert aus der Base

#### Scenario: Dev-Base bleibt unverändert (Patch-only-Strategie) *(BATS)*

- **GIVEN** `k3d/configmap-domains.yaml` ist der Dev-SSOT
- **WHEN** die Base-Datei nach dem `MEDIAVIEWER_HOST`-Wert durchsucht wird
- **THEN** enthält sie `MEDIAVIEWER_HOST: "mediaviewer.localhost"` — Prod überschreibt per Patch, ohne die Base zu editieren

---

### Requirement: MEDIAVIEWER_HOST leitet sich aus PROD_DOMAIN ab (kein Hardcoding)
<!-- bats: mediaviewer-host-durability.bats -->

The system SHALL define `MEDIAVIEWER_HOST` in the prod domain-config as
`"mediaviewer.${PROD_DOMAIN}"` (an envsubst placeholder) rather than a hardcoded hostname,
so that the value is correct across all environments and brands without manual duplication.

#### Scenario: PROD_DOMAIN-Platzhalter im Prod-ConfigMap *(BATS)*

- **GIVEN** `prod/configmap-domains.yaml` enthält den `MEDIAVIEWER_HOST`-Eintrag
- **WHEN** der Wert des Eintrags mit einem regulären Ausdruck geprüft wird
- **THEN** hat er exakt die Form `"mediaviewer.${PROD_DOMAIN}"` — eine envsubst-Variable, kein fest kodierter Hostname

#### Scenario: PROD_DOMAIN in der envsubst-Variablenliste des Deploy-Tasks *(BATS)*

- **GIVEN** `Taskfile.yml` definiert `ENVSUBST_VARS` für den Prod-Deploy
- **WHEN** die Variable `ENVSUBST_VARS` nach `PROD_DOMAIN` durchsucht wird
- **THEN** ist `PROD_DOMAIN` enthalten — `mediaviewer.${PROD_DOMAIN}` wird beim Deploy substituiert und erreicht den Cluster nicht literal

---

### Requirement: Website-Deployment liest MEDIAVIEWER_HOST aus dem Domain-ConfigMap
<!-- bats: mediaviewer-host-durability.bats -->

The system SHALL wire the `MEDIAVIEWER_HOST` key from the `domain-config` ConfigMap into
the website Deployment via a `configMapKeyRef`, so that `PortalLayout` (SSR) →
`PortalSidekick` → `MediaviewerPanel` die korrekte Widget-Origin in allen Umgebungen
erhält.

#### Scenario: ConfigMapKeyRef-Referenz im Website-Manifest *(BATS)*

- **GIVEN** `k3d/website.yaml` enthält das Website-Deployment-Manifest
- **WHEN** die Umgebungsvariablen-Sektion des Containers nach `MEDIAVIEWER_HOST` durchsucht wird
- **THEN** ist ein `configMapKeyRef`-Eintrag mit `key: MEDIAVIEWER_HOST` vorhanden, der den Wert aus `domain-config` injiziert

<!-- merged from change delta mediaviewer.md (0f5b19ec3b79) -->