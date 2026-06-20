# livekit-integration

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

LiveKit stellt die WebRTC-SFU-Infrastruktur für Livestreaming bereit.
Die Integration umfasst den LiveKit-Server (hostNetwork, node-pinned), den Redis-Raumzustand,
einen RTMP-Ingress (OBS-Einspeisung), einen Egress (MP4-Recording) sowie die Website-seitige
Steuerlogik (Token-API, Status-API, Admin-Cockpit, Viewer-Seite).

---

### Requirement: Auth-Gating für Stream-Endpunkte

The system SHALL reject unauthenticated requests to `/api/stream/token`, `/api/stream/end`,
and `/api/stream/recording` with HTTP 401, and SHALL redirect unauthenticated users who
navigate to `/portal/stream` to the SSO login page.

#### Scenario: Unauthentifizierter Token-Request

- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein POST-Request an `/api/stream/token` gesendet wird
- **THEN** antwortet das System mit HTTP 401 und `{ "error": "Unauthorized" }`

#### Scenario: Unauthentifizierter Viewer-Seitenaufruf

- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `/portal/stream` aufruft
- **THEN** wird ein Redirect zur SSO-Login-URL ausgelöst und die Stream-Seite wird nicht gerendert

---

### Requirement: Rollenbasierte JWT-Token-Ausstellung

The system SHALL issue viewer tokens (canPublish: false, canSubscribe: true, TTL 1h)
for authenticated non-admin users and publisher tokens (canPublish: true, canSubscribe: true,
roomAdmin: true, TTL 4h) for authenticated admin users, both signed with the LIVEKIT_API_KEY
and LIVEKIT_API_SECRET credentials.

#### Scenario: Viewer-Token für normalen Nutzer

- **GIVEN** ein eingeloggter Nutzer ohne Admin-Rolle sendet POST `/api/stream/token`
- **WHEN** die Token-API den Request verarbeitet
- **THEN** wird ein JWT mit `canPublish: false` und `TTL: 1h` ausgestellt

#### Scenario: Publisher-Token für Admin

- **GIVEN** ein eingeloggter Nutzer mit `role = admin` sendet POST `/api/stream/token`
- **WHEN** die Token-API den Request verarbeitet
- **THEN** wird ein JWT mit `canPublish: true`, `roomAdmin: true` und `TTL: 4h` ausgestellt

---

### Requirement: Live-Status-Abfrage ohne Auth

The system SHALL expose a public GET `/api/stream/status` endpoint that returns
`{ "live": true }` wenn aktive Publishing-Tracks im Raum `main-stream` vorhanden sind,
und `{ "live": false }` wenn der Raum leer ist oder nicht existiert — ohne Caching.

#### Scenario: Stream ist aktiv

- **GIVEN** ein Teilnehmer mit mindestens einem Track ist im Raum `main-stream` verbunden
- **WHEN** GET `/api/stream/status` aufgerufen wird
- **THEN** antwortet das System mit `{ "live": true }` und `Cache-Control: no-store`

#### Scenario: Raum existiert nicht

- **GIVEN** der Raum `main-stream` ist leer oder wurde noch nicht erstellt
- **WHEN** GET `/api/stream/status` aufgerufen wird
- **THEN** antwortet das System mit HTTP 200 und `{ "live": false }` (kein Fehler)

---

### Requirement: Admin-only Stream-Terminierung

The system SHALL allow only authenticated admin users to terminate an active stream via
POST `/api/stream/end`, which SHALL delete all active RTMP ingresses and remove all
publishing participants from `main-stream` — and SHALL return HTTP 200 with counts even
when no stream was active (idempotent).

#### Scenario: Stream beenden als Admin

- **GIVEN** ein Admin ist eingeloggt und ein RTMP-Ingress sowie ein Publisher sind aktiv
- **WHEN** POST `/api/stream/end` ausgeführt wird
- **THEN** werden der Ingress gelöscht und der Publisher entfernt; die Antwort enthält
  `ingressDeleted: 1` und `participantsRemoved: 1`

#### Scenario: Idempotenz bei inaktivem Stream

- **GIVEN** kein Ingress und kein Publisher ist aktiv
- **WHEN** POST `/api/stream/end` ausgeführt wird
- **THEN** antwortet das System mit HTTP 200 und `ingressDeleted: 0, participantsRemoved: 0`

---

### Requirement: RTMP-Einspeisung über LiveKit Ingress

The system SHALL accept RTMP streams on port 1935 via the LiveKit Ingress component and
forward them as WebRTC tracks into the `main-stream` room, enabling OBS or compatible
RTMP publishers to go live without a browser.

#### Scenario: OBS-Publisher verbindet sich

- **GIVEN** ein RTMP-Client (z. B. OBS) sendet einen Stream an `rtmp://<STREAM_DOMAIN>/live/<LIVEKIT_RTMP_KEY>`
- **WHEN** der LiveKit-Ingress die Verbindung akzeptiert
- **THEN** erscheinen die Audio- und Video-Tracks im Raum `main-stream` und `/api/stream/status` gibt `live: true` zurück

---

### Requirement: Egress-Recording auf persistenten Volume

The system SHALL allow authenticated admins to start and stop MP4 room-composite recordings
via POST `/api/stream/recording` with `action: "start"` / `action: "stop"`, writing files
to `/recordings/<room>-<timestamp>.mp4` on a 20 GiB PersistentVolumeClaim.

#### Scenario: Recording starten

- **GIVEN** ein Admin sendet POST `/api/stream/recording` mit `{ "action": "start" }`
- **WHEN** der Egress-Client den Auftrag verarbeitet
- **THEN** gibt die API `{ "egressId": "<id>" }` zurück und die Aufnahme läuft auf dem PVC

#### Scenario: Recording stoppen

- **GIVEN** eine aktive Egress-Session mit bekannter `egressId`
- **WHEN** POST `/api/stream/recording` mit `{ "action": "stop", "egressId": "<id>" }` gesendet wird
- **THEN** wird die Aufnahme beendet und `{ "ok": true }` zurückgegeben

---

### Requirement: CORS-Freigabe für Browser-WebSocket

The system SHALL apply a Traefik CORS middleware on the `wss://livekit.<PROD_DOMAIN>` IngressRoute
that permits cross-origin requests from `https://web.<PROD_DOMAIN>` so that the livekit-client
SDK in the browser can complete the `/rtc/v1/validate` preflight before opening the WebSocket.

#### Scenario: Browser öffnet WebSocket-Verbindung

- **GIVEN** die Website unter `https://web.mentolder.de` lädt den StreamPlayer
- **WHEN** livekit-client sendet einen OPTIONS-Preflight an `https://livekit.mentolder.de`
- **THEN** antwortet Traefik mit `Access-Control-Allow-Origin: https://web.mentolder.de`
  und der WebSocket wird erfolgreich geöffnet

#### Scenario: Fremde Origin wird geblockt

- **GIVEN** ein Request kommt von einer nicht in der Allow-Liste stehenden Origin
- **WHEN** der Browser den Preflight sendet
- **THEN** fehlt der CORS-Header und der Browser blockiert die Verbindung

---

### Requirement: Node-Pinning und hostNetwork-Isolation

The system SHALL schedule `livekit-server` exclusively on a designated fleet node
(per-brand: `pk-hetzner-4` für mentolder, `pk-hetzner-6` für korczewski) using
`nodeAffinity` with `hostNetwork: true`, and SHALL use `Recreate` deployment strategy
to avoid port conflicts on port 7880/7881; RTMP LoadBalancer Service SHALL be pinned
to the same node via `svccontroller.k3s.cattle.io/nodeselector`.

#### Scenario: Neustart des livekit-server Pods

- **GIVEN** ein Rolling-Update wird ausgelöst (z. B. neues Image)
- **WHEN** die Recreate-Strategie greift
- **THEN** wird der alte Pod gestoppt bevor der neue startet, und Port 7880/7881 ist zu keiner Zeit doppelt belegt

#### Scenario: Falsch gesetztes nodeAffinity

- **GIVEN** `livekit-server` hat keine nodeAffinity auf den pinned Node
- **WHEN** der Pod auf einem anderen Node startet
- **THEN** findet STUN eine private flannel-IP statt der öffentlichen Node-IP und ICE-Negotiation schlägt fehl
