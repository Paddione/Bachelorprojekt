# livekit-integration

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

LiveKit stellt die WebRTC-SFU-Infrastruktur für Livestreaming bereit.
Die Integration umfasst den LiveKit-Server (hostNetwork, node-pinned), den Redis-Raumzustand,
einen RTMP-Ingress (OBS-Einspeisung), einen Egress (MP4-Recording) sowie die Website-seitige
Steuerlogik (Token-API, Status-API, Admin-Cockpit, Viewer-Seite).

---

## Requirements

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

---

### Requirement: Viewer JWT Token Format

The system SHALL return a non-empty JWT string of more than 20 characters when `createViewerToken` is called with a valid user identity, display name, LiveKit API key, and API secret.

#### Scenario: Viewer-Token hat gültiges JWT-Format

- **GIVEN** eine gültige User-ID (`user-123`), ein Anzeigename, ein LiveKit-API-Key und ein API-Secret sind vorhanden
- **WHEN** `createViewerToken` mit diesen Parametern aufgerufen wird
- **THEN** ist der Rückgabewert ein `string` mit einer Länge von mehr als 20 Zeichen

---

### Requirement: Publisher JWT Token Format

The system SHALL return a non-empty JWT string of more than 20 characters when `createPublisherToken` is called with a valid admin identity, display name, LiveKit API key, and API secret.

#### Scenario: Publisher-Token hat gültiges JWT-Format

- **GIVEN** eine gültige Admin-ID (`admin-1`), ein Anzeigename, ein LiveKit-API-Key und ein API-Secret sind vorhanden
- **WHEN** `createPublisherToken` mit diesen Parametern aufgerufen wird
- **THEN** ist der Rückgabewert ein `string` mit einer Länge von mehr als 20 Zeichen

---

### Requirement: Talk Webhook Signature Verification — Valid Signature

The system SHALL accept an incoming Nextcloud Talk webhook when the HMAC-SHA256 signature computed from `HMAC(secret, random + body)` matches the provided signature header.

#### Scenario: Korrekte Signatur wird akzeptiert

- **GIVEN** ein bekanntes Secret, ein Random-Wert und ein Request-Body sind vorhanden
- **WHEN** `verifyTalkSignature` mit der korrekt berechneten HMAC-SHA256-Signatur aufgerufen wird
- **THEN** gibt die Funktion `true` zurück

#### Scenario: Minimales gültiges Beispiel wird bestätigt

- **GIVEN** Secret `'sekret'`, Random `'abc123'` und Body `'{"hello":"world"}'` mit passender Signatur
- **WHEN** `verifyTalkSignature` aufgerufen wird
- **THEN** ist das Ergebnis `true`

---

### Requirement: Talk Webhook Signature Rejection — Tampered Body

The system SHALL reject a Talk webhook request when the request body has been modified after the signature was computed, regardless of how small the modification is.

#### Scenario: Manipulierter Body wird abgelehnt

- **GIVEN** eine gültige Signatur wurde für den Body `'{"hello":"world"}'` berechnet
- **WHEN** `verifyTalkSignature` mit dem abgeänderten Body `'{"hello":"WORLD"}'` aufgerufen wird
- **THEN** gibt die Funktion `false` zurück

---

### Requirement: Talk Webhook Signature Rejection — Wrong Secret

The system SHALL reject a Talk webhook request when the verification secret differs from the secret used to sign the request.

#### Scenario: Falsches Secret führt zur Ablehnung

- **GIVEN** eine gültige Signatur wurde mit Secret `'sekret'` berechnet
- **WHEN** `verifyTalkSignature` mit Secret `'other'` aufgerufen wird
- **THEN** gibt die Funktion `false` zurück

---

### Requirement: Talk Webhook Signature Rejection — Empty Inputs

The system SHALL reject a Talk webhook request when any of the critical inputs (secret, random value, or signature) is an empty string.

#### Scenario: Leeres Secret, leerer Random-Wert oder leere Signatur werden abgelehnt

- **GIVEN** alle anderen Parameter sind korrekt gesetzt
- **WHEN** `verifyTalkSignature` mit leerem Secret (`''`), leerem Random-Wert (`''`) oder leerer Signatur (`''`) aufgerufen wird
- **THEN** gibt die Funktion in allen drei Fällen `false` zurück

---

### Requirement: Talk Webhook Signature Rejection — Length Mismatch

The system SHALL reject a Talk webhook request when the provided signature has a different byte length than the expected HMAC-SHA256 hex digest (64 hex characters), preventing padding or truncation attacks.

#### Scenario: Zu kurze Signatur wird abgelehnt

- **GIVEN** alle anderen Parameter (Secret, Random, Body) sind korrekt
- **WHEN** `verifyTalkSignature` mit einer Signatur aufgerufen wird, die kürzer als 64 Zeichen ist (z. B. `'short'`)
- **THEN** gibt die Funktion `false` zurück

---

### Requirement: DNS Pinning auf pk-hetzner-4 IP

The system SHALL configure DNS records for `livekit.<PROD_DOMAIN>` and `stream.<PROD_DOMAIN>` to resolve exclusively to `204.168.244.104` (pk-hetzner-4), because without this pin, browser ICE connections silently fail approximately 66% of the time by landing on fleet nodes that do not run `livekit-server`.

#### Scenario: DNS-Pin korrekt gesetzt

- **GIVEN** `livekit-server` läuft auf `pk-hetzner-4` (IP `204.168.244.104`) mit `hostNetwork: true`
- **WHEN** ein Browser eine WebRTC ICE-Verbindung aufbaut und `livekit.<domain>` auflöst
- **THEN** erhält der Browser die IP `204.168.244.104` und verbindet sich direkt mit dem laufenden LiveKit-Pod

#### Scenario: DNS-Pin fehlt oder zeigt auf anderen Fleet-Node

- **GIVEN** der DNS-Eintrag für `livekit.<domain>` zeigt auf einen anderen Fleet-Node (z. B. `pk-hetzner-6`)
- **WHEN** ein Browser eine ICE-Verbindung versucht
- **THEN** schlägt die ICE-Negotiation still fehl, weil auf dem Ziel-Node kein `livekit-server` auf Port 7880/7881 lauscht

---

### Requirement: Host-Firewall-Ports für LiveKit-Traffic

The system SHALL open TCP ports 7880 and 7881 and UDP port ranges 50000-60000 and 30000-40000 on all fleet nodes via `prod/cloud-init.yaml`, because the Hetzner host firewall blocks all inter-node traffic on non-80/443 ports by default and without these rules WebRTC media traffic cannot reach the `livekit-server` Pod.

#### Scenario: ufw-Regeln korrekt gesetzt

- **GIVEN** ein Fleet-Node wurde mit den `prod/cloud-init.yaml`-Regeln provisioniert
- **WHEN** ein WebRTC-Client UDP-Pakete an Port 50000-60000 sendet
- **THEN** erreichen die Pakete den `livekit-server` und Medien-Tracks werden erfolgreich übertragen

#### Scenario: ufw-Regeln fehlen auf neuem Node

- **GIVEN** ein neuer Fleet-Node wurde ohne die LiveKit-spezifischen ufw-Regeln zum Cluster hinzugefügt
- **WHEN** ein LiveKit-Pod auf diesem Node ICE-Verbindungen über UDP annimmt
- **THEN** blockiert die Host-Firewall den UDP-Traffic und alle WebRTC-Verbindungen über diesen Node scheitern lautlos

---

### Requirement: Room.connect() nur nach User-Gesture

The system SHALL invoke `Room.connect()` exclusively in response to a direct user interaction (z. B. Button-Click), because Chrome blocks the AudioContext API when it is created outside of a user gesture, which causes the audio track to remain permanently muted even if the WebSocket connection succeeds.

#### Scenario: Verbindung nach User-Gesture

- **GIVEN** die Stream-Viewer-Seite ist geladen und der Nutzer klickt auf den Play-Button
- **WHEN** der Click-Handler `Room.connect()` aufruft
- **THEN** startet der AudioContext erfolgreich und Audioausgabe ist hörbar

#### Scenario: Verbindung ohne User-Gesture (z. B. onMount auto-connect)

- **GIVEN** die Stream-Viewer-Seite ruft `Room.connect()` automatisch beim Laden auf (kein Nutzer-Klick)
- **WHEN** Chrome den AudioContext-Start versucht
- **THEN** blockiert Chrome den AudioContext mit der Policy-Warnung und der Audio-Track bleibt stumm, obwohl die WebSocket-Verbindung technisch aufgebaut ist

---

### Requirement: LiveKit deaktiviert in Staging

The system SHALL keep the `livekit-server` Deployment in the staging namespace at 0 replicas, because the `hostNetwork: true` slot on `pk-hetzner-4` is exclusively occupied by the production LiveKit Pod and a second Pod on the same host port would cause an unrecoverable port conflict.

#### Scenario: Staging-Deploy bringt LiveKit nicht hoch

- **GIVEN** `task workspace:deploy ENV=staging` wird ausgeführt
- **WHEN** Kubernetes das Staging-Overlay anwendet
- **THEN** bleibt das `livekit-server` Deployment auf 0 Replicas und kein Pod konkurriert um den hostNetwork-Port auf `pk-hetzner-4`

#### Scenario: Versehentliche Skalierung in Staging

- **GIVEN** das Staging `livekit-server` Deployment wird manuell auf 1 Replica skaliert
- **WHEN** Kubernetes den Pod scheduled und er auf `pk-hetzner-4` startet
- **THEN** schlägt der Pod-Start mit einem Port-Bind-Fehler fehl, weil der Prod-LiveKit-Pod Port 7880/7881 bereits belegt

---

### Requirement: Namespace Pod-Security-Policy für hostNetwork

The system SHALL configure the `workspace` namespace with `pod-security: privileged` label, because `hostNetwork: true` on the `livekit-server` Pod requires the privileged security policy — without it, the admission controller rejects the Pod and LiveKit cannot start.

#### Scenario: Pod startet erfolgreich mit privileged-Label

- **GIVEN** der `workspace`-Namespace hat das Label `pod-security.kubernetes.io/enforce: privileged`
- **WHEN** `livekit-server` mit `hostNetwork: true` deployed wird
- **THEN** akzeptiert der Kubernetes-Admission-Controller den Pod und er startet ohne Security-Policy-Fehler

#### Scenario: Pod-Security auf restricted — hostNetwork wird abgelehnt

- **GIVEN** der `workspace`-Namespace verwendet die `restricted` Pod-Security-Policy (kein privileged-Label)
- **WHEN** ein `livekit-server`-Pod mit `hostNetwork: true` scheduled wird
- **THEN** lehnt der Admission-Controller den Pod mit einem Policy-Fehler ab und LiveKit bleibt offline

---

### Requirement: wg-fleet-Mesh-Mitgliedschaft für neue Fleet-Nodes

The system SHALL join every new fleet node to the `wg-fleet` WireGuard mesh (10.20.0.x subnet) and configure the k3s agent with `--flannel-iface=wg-fleet`, because without this the LiveKit Pod cannot reach other pods (e.g. Redis room-state) via pod-to-pod traffic and ICE relay paths through non-mesh nodes silently break.

#### Scenario: Neuer Node korrekt in wg-fleet eingebunden

- **GIVEN** ein neuer Fleet-Node hat eine `wg-fleet`-Peer-Konfiguration aus `wireguard/wg-mesh-nodes.yaml` und k3s wurde mit `--flannel-iface=wg-fleet` gestartet
- **WHEN** ein LiveKit-Pod auf diesem Node einen Redis-Lookup oder eine Medien-Weiterleitung an einen anderen Node initiiert
- **THEN** routen die Pakete über das `wg-fleet`-Interface und die Verbindung wird erfolgreich hergestellt

#### Scenario: Node ohne wg-fleet — pod-to-pod-Traffic bricht lautlos

- **GIVEN** ein Fleet-Node wurde ohne `wg-fleet`-Mitgliedschaft zum Cluster hinzugefügt (Standard-Interface statt wg-fleet)
- **WHEN** ein LiveKit-Pod auf diesem Node versucht, einen anderen Pod auf einem anderen Node zu erreichen
- **THEN** schlägt der pod-to-pod-Traffic lautlos fehl, weil Flannel über das falsche Interface routet

---

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the livekit-integration specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/livekit-integration.bats` file exists
- **WHEN** `bats tests/spec/livekit-integration.bats` runs
- **THEN** the smoke test exits successfully

## Testszenarien

<!-- merged from Playwright e2e tests -->

### Requirement: Auth-Gating für Stream-Admin- und Viewer-Endpunkte
<!-- e2e: fa-livekit.spec.ts | e2e: fa-admin-live.spec.ts -->

The system SHALL redirect unauthenticated users away from all protected stream and admin pages, and SHALL reject unauthenticated API calls with HTTP 401 or 403.

#### Scenario: /admin/stream leitet unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `/admin/stream` aufruft
- **THEN** wird ein Redirect ausgelöst und die URL endet nicht auf `/admin/stream`

#### Scenario: /portal/stream leitet unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `/portal/stream` aufruft
- **THEN** wird ein Redirect ausgelöst und die URL endet nicht auf `/portal/stream`

#### Scenario: /api/stream/token verlangt Authentifizierung *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein POST-Request an `/api/stream/token` gesendet wird
- **THEN** antwortet das System mit HTTP 401 oder 403

#### Scenario: /api/stream/end verlangt Authentifizierung *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein POST-Request an `/api/stream/end` gesendet wird
- **THEN** antwortet das System mit HTTP 401 oder 403

#### Scenario: /admin/live leitet unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `/admin/live` aufruft
- **THEN** wird ein Redirect ausgelöst; die finale URL ist nicht `BASE/admin/live`

#### Scenario: /admin/stream redirected auf /admin/live *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `/admin/stream` aufruft
- **THEN** ist die finale URL `/admin/live`, die Login-Seite oder Keycloak-Auth

#### Scenario: /admin/meetings redirected auf /admin/live *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `/admin/meetings` aufruft
- **THEN** ist die finale URL `/admin/live`, die Login-Seite oder Keycloak-Auth

---

### Requirement: Öffentlicher Status-Endpunkt
<!-- e2e: fa-livekit.spec.ts -->

The system SHALL expose `/api/stream/status` as a public endpoint returning HTTP 200, 401, or 403 — never a server error.

#### Scenario: /api/stream/status-Endpunkt ist erreichbar *(E2E)*
- **GIVEN** der Website-Server läuft
- **WHEN** ein GET-Request an `/api/stream/status` gesendet wird
- **THEN** antwortet das System mit HTTP 200, 401 oder 403 (kein 5xx)

---

### Requirement: LiveKit Ingress-Erreichbarkeit
<!-- e2e: fa-livekit.spec.ts -->

The system SHALL expose the LiveKit server over HTTPS at `livekit.<PROD_DOMAIN>` and respond with HTTP 200, 404, or 426 (WebSocket Upgrade required), confirming DNS-pinning and TLS are correctly configured.

#### Scenario: LiveKit-Ingress über HTTPS erreichbar *(E2E)*
- **GIVEN** DNS für `livekit.<PROD_DOMAIN>` zeigt auf `pk-hetzner-4` (204.168.244.104)
- **WHEN** ein HTTP GET an `https://livekit.<PROD_DOMAIN>/` gesendet wird
- **THEN** antwortet der Server mit HTTP 200, 404 oder 426 (kein Verbindungsfehler, kein 5xx)

---

### Requirement: Nextcloud Talk-Oberfläche und HPB-Signaling
<!-- e2e: fa-03-video.spec.ts | e2e: fa-ios-talk.spec.ts -->

The system SHALL serve the Nextcloud Talk interface at `/apps/spreed` (or `/index.php/apps/spreed`), redirect unauthenticated users to login, and expose the HPB Signaling-Server `/api/v1/welcome` endpoint returning HTTP 200 with a `version` field.

#### Scenario: Talk-Oberfläche öffnen (unauthentifiziert) *(E2E)*
- **GIVEN** kein gültiges Nextcloud-Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `<NC_URL>/apps/spreed` aufruft
- **THEN** ist entweder die Talk-App, die NC-Login-Seite oder Keycloak sichtbar (kein 500, kein leeres DOM)

#### Scenario: HPB Signaling-Server antwortet *(E2E)*
- **GIVEN** `TEST_SIGNALING_URL` ist gesetzt und der NATS-Backend läuft
- **WHEN** ein GET-Request an `/api/v1/welcome` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und dem Feld `version` im JSON-Body

#### Scenario: Talk als Gast erreichbar *(E2E)*
- **GIVEN** ein Browser ohne Anmeldung ruft `<NC_URL>/apps/spreed` auf
- **WHEN** die Seite geladen wird
- **THEN** erscheint die NC-Login-Seite oder Keycloak-Auth (kein 500)

#### Scenario: Talk-Oberfläche auf iPhone (WebKit) erreichbar *(E2E)*
- **GIVEN** ein iPhone-ähnlicher Browser-Kontext ruft `<NC_URL>/apps/spreed` auf
- **WHEN** die Seite geladen wird
- **THEN** erscheint die Talk-App oder Login-Seite ohne 500-Fehler

#### Scenario: notify_push-Endpunkt antwortet *(E2E)*
- **GIVEN** Nextcloud mit notify_push-App läuft unter `<NC_URL>`
- **WHEN** ein GET-Request an `<NC_URL>/push` gesendet wird
- **THEN** antwortet der Server mit HTTP 200, 400 oder 405 (Dienst erreichbar)

#### Scenario: Responsive Layout auf iPhone (kein horizontales Scrollen) *(E2E)*
- **GIVEN** die Talk-Seite ist in einem iPhone-Viewport (375 px) geladen
- **WHEN** `scrollWidth` und `clientWidth` des `<html>`-Elements verglichen werden
- **THEN** ist `scrollWidth` nicht mehr als 10 px größer als `clientWidth`

---

### Requirement: Meeting-History-Endpunkte und Portal-Routing
<!-- e2e: fa-meeting-history.spec.ts -->

The system SHALL protect `/api/meeting/release` with authentication, serve `/portal?tab=meetings` without 404, and return no 500 server error on navigation to that route.

#### Scenario: /api/meeting/release verlangt Authentifizierung *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein POST-Request an `/api/meeting/release` mit `{ meetingId: 'test-123' }` gesendet wird
- **THEN** antwortet das System mit HTTP 401 oder 403

#### Scenario: /portal?tab=meetings liefert keine 404-Seite *(E2E)*
- **GIVEN** kein gültiges Session-Cookie ist vorhanden
- **WHEN** ein Nutzer `/portal?tab=meetings` aufruft (Redirect zur Login-Seite erwartet)
- **THEN** enthält der gerenderte Body nicht den Text „404"

#### Scenario: Navigation zu /portal?tab=meetings erzeugt keinen Server-Fehler *(E2E)*
- **GIVEN** der Website-Server läuft
- **WHEN** ein Nutzer `/portal?tab=meetings` aufruft
- **THEN** ist der HTTP-Statuscode nicht 500

---

### Requirement: Talk-Transcriber Webhook HMAC-Authentifizierung
<!-- e2e: fa-18-transcription.spec.ts -->

The system SHALL reject webhook requests to `/webhook` without a valid HMAC-SHA256 signature in `X-Nextcloud-Talk-Signature`, SHALL accept valid signatures, SHALL ignore events without a room token, and SHALL return HTTP 400 for malformed JSON.

#### Scenario: Transcriber /health gibt Status ok oder degraded zurück *(E2E)*
- **GIVEN** der `talk-transcriber`-Dienst läuft (ClusterIP, nur aus dem Cluster erreichbar)
- **WHEN** ein GET-Request an `/health` gesendet wird
- **THEN** antwortet der Dienst mit HTTP 200 und einem Body `{ status: 'ok'|'degraded', pulseaudio: boolean, active: [] }`

#### Scenario: /webhook lehnt fehlende HMAC-Signatur mit 401 ab *(E2E)*
- **GIVEN** der Transcriber läuft und kein `X-Nextcloud-Talk-Signature`-Header ist vorhanden
- **WHEN** ein POST-Request an `/webhook` mit gültigem JSON gesendet wird
- **THEN** antwortet der Dienst mit HTTP 401

#### Scenario: /webhook lehnt falsche HMAC-Signatur mit 401 ab *(E2E)*
- **GIVEN** der Transcriber läuft
- **WHEN** ein POST-Request mit ungültigem Signatur-Header (`badsignature`) gesendet wird
- **THEN** antwortet der Dienst mit HTTP 401

#### Scenario: /webhook akzeptiert gültige HMAC-Signatur *(E2E)*
- **GIVEN** der Transcriber läuft und eine korrekte HMAC-SHA256-Signatur wird berechnet
- **WHEN** ein POST-Request mit dem Signatur-Header und gültigem JSON gesendet wird
- **THEN** antwortet der Dienst mit HTTP 2xx und einem Status `started`, `ok` oder `rejected`

#### Scenario: /webhook ignoriert Events ohne Room-Token *(E2E)*
- **GIVEN** der Transcriber läuft und eine gültige Signatur wird berechnet
- **WHEN** ein POST-Request mit `{ event: 'call_started' }` (kein `token`-Feld) gesendet wird
- **THEN** antwortet der Dienst mit HTTP 2xx und `{ status: 'ignored' }`

#### Scenario: /webhook lehnt malformatiertes JSON mit 400 ab *(E2E)*
- **GIVEN** der Transcriber läuft und eine gültige Signatur für einen ungültigen JSON-String wird berechnet
- **WHEN** ein POST-Request mit `Content-Type: application/json` und fehlerhaftem JSON gesendet wird
- **THEN** antwortet der Dienst mit HTTP 400

#### Scenario: /health meldet aktive Session nach Webhook-Trigger *(E2E)*
- **GIVEN** der Transcriber läuft
- **WHEN** ein `call_started`-Event mit gültiger Signatur und eindeutigem Token gesendet wird, gefolgt von einem `/health`-Request
- **THEN** hat der Health-Response ein `active`-Array (Session gestartet oder abgelehnt, Struktur muss valide sein)

---

### Requirement: System-Test 11 — LiveKit & Streaming (End-to-End-Walk)
<!-- e2e: systemtest-11-livekit.spec.ts -->

The system SHALL support walking all 7 steps of System-Test 11 (LiveKit & Streaming) via the Admin-Cockpit UI, including RTMP stream setup, viewer connection, recording, and teardown.

#### Scenario: System-Test 11 Schritte werden vollständig durchlaufen *(E2E)*
- **GIVEN** Admin-Zugangsdaten sind gesetzt (`ADMIN_PASSWORD`) und die Website läuft
- **WHEN** `walkSystemtestByTemplate(page, 11)` alle 7 Schritte des Templates durchläuft
- **THEN** werden alle Schritte abgehakt und das Systemtest-Formular erfolgreich abgesendet (Timeout: 180 s)

<!-- merged from change delta livekit-integration.md (547097423a63) -->