# brett

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Systemisches Brett ist ein browserbasiertes 3D-Konstellationsboard für systemische Coaching-Arbeit. Es läuft als einzelner Node.js-Pod (`workspace-brett`) und verbindet statische HTML-Auslieferung, WebSocket-Echtzeitsynchronisation und REST-Persistenz auf Port 3000. Alle Figuren-Zustände werden im Shared-PostgreSQL (`brett_rooms`-Tabelle) persistiert; das In-Memory-Figuremap ist der primäre Zustandsspeicher während einer Session.

---

## Requirements

### Requirement: Keycloak-SSO-Authentifizierung via OAuth2-Proxy

The system SHALL gate all access to the board UI behind a Keycloak OIDC authentication flow, enforced by a dedicated `oauth2-proxy-brett` sidecar deployment, so that no unauthenticated request reaches the brett application pod.

#### Scenario: Unauthentifizierter Aufruf wird weitergeleitet

- **GIVEN** ein Nutzer ruft `brett.localhost/` auf, ohne aktive Keycloak-Session
- **WHEN** der OAuth2-Proxy empfängt die Anfrage
- **THEN** leitet er den Browser auf den Keycloak-Login-Endpunkt weiter; nach erfolgreichem Login wird er zurück zu brett weitergeleitet

#### Scenario: Authentifizierter Nutzer erhält Zugang

- **GIVEN** ein Nutzer hat eine gültige Keycloak-Session (Realm `workspace`, Client `brett-app`)
- **WHEN** er `/` aufruft
- **THEN** liefert der brett-Pod `index.html` aus und setzt ein HttpOnly-Session-Cookie (`_oauth2_proxy_brett`)

#### Scenario: View-only Share-Link umgeht OIDC

- **GIVEN** ein Admin hat einen Share-Token erstellt und teilt `/share/<token>` mit einem Dritten
- **WHEN** der Dritte den Link öffnet (ohne Keycloak-Account)
- **THEN** erhält er lesenden Zugang (`_isGuest=true`) und kann keine Figuren mutieren

---

### Requirement: Rollenbasierte Mutationsrechte (Default-Deny)

The system SHALL enforce a role-based permission matrix for all board mutations over WebSocket, where any message type not explicitly permitted for the caller's role is rejected before broadcast or persistence.

#### Scenario: Leiter darf alles mutieren

- **GIVEN** ein Nutzer ist als `leiter` in der Session-Rolle eingetragen (via `__roles__` im Raum-State)
- **WHEN** er eine `add`, `move`, `clear` oder `admin_*`-Nachricht sendet
- **THEN** wird die Mutation angewandt und an alle anderen Teilnehmer gebcast

#### Scenario: Stellvertreter darf nur eigene Figuren bewegen

- **GIVEN** ein Nutzer hat die Rolle `stellvertreter` und Figur X hat `ownerId === userId`
- **WHEN** er `move` oder `delete` für Figur X sendet
- **THEN** wird die Mutation zugelassen; für Figuren anderer Eigentümer wird sie abgelehnt

#### Scenario: Beobachter ist schreibgeschützt

- **GIVEN** ein Nutzer verbindet sich ohne zugewiesene Rolle (Rolle fällt auf `beobachter`)
- **WHEN** er `add` oder `move` sendet
- **THEN** lehnt der Server ab; nur `request_state_snapshot` und `figure_possess`/`figure_release` sind erlaubt

---

### Requirement: WebSocket-Echtzeitsynchronisation über `/sync`

The system SHALL synchronise all figure mutations across all connected clients in a room via a WebSocket endpoint at `/sync?room=<token>`, broadcasting each permitted mutation to all participants except the sender.

#### Scenario: Neue Figur wird an alle verteilt

- **GIVEN** drei Clients sind im selben Raum verbunden
- **WHEN** Client A sendet `{type:"add", figure:{id:"f1", ...}}`
- **THEN** empfangen Client B und Client C innerhalb von 150 ms eine identische `add`-Nachricht; Client A empfängt sie nicht erneut

#### Scenario: Reconnect lädt aktuellen Raumzustand

- **GIVEN** ein Client verliert die Verbindung und verbindet sich neu (gleicher `?room=`-Token)
- **WHEN** die WS-Verbindung aufgebaut ist
- **THEN** sendet der Server ein `state_snapshot`-Paket mit allen aktuellen Figuren, Ankern, Linien und der aktuellen Phase

---

### Requirement: Persistenz des Board-Zustands in PostgreSQL

The system SHALL persist the board state (figures, roles, session metadata) to the `brett_rooms` table in the shared PostgreSQL database on a debounced schedule, and restore it on pod restart so that no board data is lost across deployments.

#### Scenario: Debounced Persist nach Mutation

- **GIVEN** ein Leiter verschiebt mehrere Figuren in rascher Folge
- **WHEN** die letzte Mutation eintrifft
- **THEN** plant der Server einen einzigen Persist-Aufruf (debounced); mehrere Mutationen innerhalb des Debounce-Fensters erzeugen keinen separaten DB-Write

#### Scenario: Pod-Neustart stellt Zustand wieder her

- **GIVEN** der brett-Pod wird neu gestartet (z. B. durch Recreate-Deployment)
- **WHEN** der erste Client denselben `room`-Token verwendet
- **THEN** lädt der Server den zuletzt persistierten State aus `brett_rooms.state` und sendet ihn als `state_snapshot`

---

### Requirement: Session-Verwaltung mit Admin-Token-Handoff

The system SHALL manage coaching sessions with a unique join code (Crockford Base32, `XXX-XXX` format), an admin token that designates the current session leader, and a grace-period mechanism for admin-token handoff on leader disconnect.

#### Scenario: Admin erstellt Session

- **GIVEN** ein authentifizierter Admin sendet `admin_session_create` über WebSocket
- **WHEN** noch kein Session-Code für den Raum existiert
- **THEN** erzeugt der Server einen eindeutigen 6-stelligen Crockford-Code, trägt den Admin als `leiter` ein und broadcastet `session_created` mit dem Code

#### Scenario: Admin-Token-Grace bei Disconnect

- **GIVEN** der aktuelle Admin-Token-Inhaber trennt die Verbindung während einer aktiven Session
- **WHEN** die Verbindung abbricht (vor `phase === 'ended'`)
- **THEN** startet der Server einen Grace-Timer; ein anderer anwesender Admin kann den Token übernehmen; nach Ablauf des Timers wird der Token freigegeben

---

### Requirement: Snapshot- und Board-Template-System

The system SHALL allow admins to save the current board state as a named snapshot, and to apply saved snapshots as curated board templates, enabling reuse of constellations across sessions.

#### Scenario: Snapshot speichern

- **GIVEN** ein Admin ruft `POST /api/snapshots` mit `{name, state, room_token}` auf
- **WHEN** `state.figures` ist nicht leer und `name` ist maximal 200 Zeichen lang
- **THEN** speichert der Server den Snapshot in `brett_snapshots` und gibt `{id, name, created_at}` zurück

#### Scenario: Template auf Raum anwenden

- **GIVEN** ein Snapshot ist als `is_template=true` markiert
- **WHEN** ein Admin sendet `admin_set_template` mit der Snapshot-ID
- **THEN** lädt der Server den Template-State aus der DB, ersetzt die aktuellen Figuren im Raum und broadcastet `template_applied` an alle Teilnehmer

---

### Requirement: Undo/Redo für Figuren-Mutationen

The system SHALL maintain a per-room undo/redo stack for reversible figure mutations (`add`, `move`, `update`, `delete`, `clear`), allowing the session admin to step backwards and forwards through board changes without interrupting the session.

#### Scenario: Undo der letzten Figur-Mutation

- **GIVEN** der Leiter hat zuletzt eine Figur verschoben
- **WHEN** er `session_undo` sendet
- **THEN** stellt der Server die Figur auf ihre vorherige Position zurück und broadcastet den neuen Zustand; der Redo-Stack enthält jetzt diesen Schritt

#### Scenario: Undo-Stack wird bei Session-Reset geleert

- **GIVEN** der Admin startet eine neue Runde (`admin_round_start`)
- **WHEN** die Phase wechselt
- **THEN** werden Undo- und Redo-Stack für den Raum geleert

---

### Requirement: Snapshot-/Export-UI (PNG/JSON/PDF)
<!-- baseline aus Codebase-Analyse am 2026-07-15 (T001869) — dokumentiert shipped Verhalten aus T000466 -->

The client SHALL provide export buttons in the topbar HUD (`brett/src/client/ui/export.ts`) that export the current board state entirely client-side — as a PNG screenshot of the WebGL canvas, as a structured JSON snapshot, or as a printable PDF (via dynamic `import('jspdf')`, A4 landscape with metadata and figure list). No data leaves the browser except through the user-initiated download; there are no server endpoints for export.

The JSON export SHALL be built from a client-side export cache (`updateExportCache()`/`getExportSnapshot()`), fed by `ws-client.ts` on every relevant server message (`snapshot`, `add`, `move`, `update`, `delete`, `session_phase_change`).

**Constraint (non-obvious):** the Three.js scene MUST be initialized with `preserveDrawingBuffer: true`. WebGL clears the drawing buffer after each `render()` by default, so `renderer.domElement.toDataURL()` only returns a valid image within the same frame — or with the preserve flag set. The flag costs rendering performance, which is acceptable in the coaching context (no 60-fps game loop). Do not "optimize" it away without replacing the PNG export mechanism.

#### Scenario: PNG-Export liefert die aktuelle 3D-Ansicht

- **GIVEN** ein gebootetes Board mit gerenderten Figuren
- **WHEN** der Nutzer den PNG-Export-Button klickt
- **THEN** wird `renderer.domElement.toDataURL('image/png')` aufgerufen und die aktuelle Ansicht inkl. Figuren, Kamera-Perspektive und Licht als Download ausgelöst

#### Scenario: JSON-Export serialisiert den Client-Cache

- **GIVEN** der Export-Cache wurde durch WS-Nachrichten befüllt
- **WHEN** der Nutzer den JSON-Export-Button klickt
- **THEN** wird ein `ClientBoardSnapshot` (exportedAt, sessionCode, phase, stiffness, figures, optik) als JSON-Datei heruntergeladen

---

### Requirement: Beziehungs-/Spannungslinien zwischen Figuren
<!-- baseline aus Codebase-Analyse am 2026-07-15 (T001869) — dokumentiert shipped Verhalten aus T000467 -->

The system SHALL support persistent, bidirectional lines between two figures with three types — `relationship` (blue `#4ea1ff`, solid), `tension` (red `#e05555`, dashed), `resource` (green `#55bb77`, solid) — rendered as `CatmullRomCurve3` arcs (`brett/src/client/scene-lines.ts`). Lines are purely informational annotations by the session leader: they create no physical constraints and never influence figure movement.

Lines are a separate entity (`BrettLine { id, fromId, toId, lineType, createdBy? }`), stored under the sentinel key `__lines__` in the room's figureMap (pattern of `__roles__`/`__lobby_settings__`) — deliberately NOT as `figure.relations[]`, so a line "belongs" to neither figure and deleting a figure cleanly removes its lines. Persistence rides the existing `brett_rooms.state` JSONB via `buildStateFromMutations()`/`seedFigureMapFromState()` round-trip; no schema change.

The messages `line_create`, `line_delete`, `line_type_set` are in `ADMIN_TYPES` AND additionally require the `leiter` role. Validation: no self-lines (`fromId !== toId`), both figures must exist in the room, max 100 lines per room.

#### Scenario: Leiter legt eine Spannungslinie an

- **GIVEN** zwei existierende Figuren und ein Client mit Rolle `leiter`
- **WHEN** er `line_create` mit `lineType: 'tension'` sendet
- **THEN** erzeugt der Server eine `BrettLine` mit Server-generierter ID, broadcastet `line_created` und persistiert über den `__lines__`-Sentinel

#### Scenario: Beobachter darf keine Linien anlegen

- **GIVEN** ein Client ohne `leiter`-Rolle
- **WHEN** er `line_create` sendet
- **THEN** lehnt der Server mit `forbidden` ab

#### Scenario: Figur-Löschung räumt ihre Linien ab

- **GIVEN** eine Figur mit einer verbundenen Linie
- **WHEN** die Figur gelöscht wird
- **THEN** werden alle Linien mit dieser Figur als `fromId` oder `toId` mit entfernt

---

### Requirement: Replay-Aufzeichnung von Board-Mutations (Dark-Launch)

The system SHALL record all state-mutating WebSocket events per room and session code into the `session_events` table with monotone sequence numbers, enabling a timeline replay that reconstructs the full board history, when the `replay` feature flag is active.

#### Scenario: Event wird im Buffer aufgezeichnet

- **GIVEN** die `replay`-Feature-Flag ist `true` und eine Session ist aktiv
- **WHEN** der Server eine erlaubte Mutation anwendet
- **THEN** wird das Event mit Typ, Payload, Timestamp und laufender Sequenznummer in den In-Memory-Puffer eingestellt und innerhalb von 2 Sekunden in `session_events` geflusht

#### Scenario: Replay lädt Session-Events per HTTP

- **GIVEN** ein Admin ruft `GET /api/sessions/<code>/events` auf (Feature-Flag aktiv)
- **WHEN** der Session-Code bekannt ist
- **THEN** gibt der Server alle `session_events`-Zeilen für diese Session geordnet nach `seq` zurück; der Client kann daraus den Board-Zustand Schritt für Schritt rekonstruieren

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Art-Library-Manifest-Validierung
<!-- bats: test_art_library_manifest.bats | e2e: brett-art.spec.ts, fa-47-brett-figure-pack-assets.spec.ts -->

The system SHALL ship a valid art-library manifest for every figure set, with every referenced SVG/PNG asset present on disk and served correctly by the brett application.

#### Scenario: Art-Library-Validator läuft fehlerfrei *(BATS)*
- **GIVEN** das Repository enthält `art-library/_tooling/validate-manifest.mjs` und alle Set-Manifests
- **WHEN** `node art-library/_tooling/validate-manifest.mjs` ausgeführt wird
- **THEN** beendet sich der Prozess mit Exit-Code 0

#### Scenario: Korczewski-Set enthält alle Pflicht-Asset-Arten *(BATS)*
- **GIVEN** `art-library/sets/korczewski/manifest.json` existiert
- **WHEN** das Manifest per `jq` nach den Arten `character`, `prop`, `terrain`, `logo` durchsucht wird
- **THEN** enthält jede Kategorie mindestens einen Eintrag

#### Scenario: Brett lädt Art-Manifest und exponiert Character-IDs *(E2E)*
- **GIVEN** ein authentifizierter Nutzer öffnet den Brett-Client (Keycloak-Session vorhanden) und das deployete Image unterstützt die Art-Library-Feature (`window.__ART_READY__`)
- **WHEN** die Seite vollständig geladen ist
- **THEN** ist `window.__ART_READY__` truthy und `window.characterIds` enthält mindestens `['figure-01', 'figure-02', 'figure-03', 'figure-04']`

#### Scenario: Platzierung einer Figur erzeugt Sprite-Child *(E2E)*
- **GIVEN** ein authentifizierter Nutzer hat den Brett-Client geladen
- **WHEN** eine Figur aus der Bibliothek auf das Board gezogen wird
- **THEN** enthält das Figure-Mesh ein Sprite-Kind-Objekt mit dem zugewiesenen Textur-Asset

#### Scenario: `placement_spec.json` wird korrekt ausgeliefert *(E2E)*
- **GIVEN** ein authentifizierter Nutzer (Keycloak-Session) ruft `/assets/figure-pack/placement_spec.json` auf
- **WHEN** die Datei vom Brett-Server ausgeliefert wird
- **THEN** antwortet der Server mit HTTP 200; das JSON registriert alle erwarteten Gesichter (`neutral`, `relieved`, `defiant`, `fearful`) und Accessoires (`shawl`, `scarf`, `spectacles`) unter den richtigen Pfaden

#### Scenario: Figure-Pack-PNG-Assets sind per HTTP abrufbar *(E2E)*
- **GIVEN** ein authentifizierter Nutzer (Keycloak-Session)
- **WHEN** er einzelne PNG-Asset-URLs aus dem Figure-Pack abruft (`assets/figure-pack/faces/*.png`, `assets/figure-pack/accessories/*.png`)
- **THEN** antworten alle URLs mit HTTP 200 und Content-Type `image/png`

---

### Requirement: Authentifizierung und SSO-Integration
<!-- e2e: brett-art.spec.ts, brett-mentolder-auth-setup.spec.ts, brett-mobile.spec.ts, fa-27-brett.spec.ts, fa-47-brett-figure-pack-assets.spec.ts -->

The system SHALL redirect unauthenticated users to the Keycloak OIDC login, persist the authenticated session via oauth2-proxy cookies, and respond to `/healthz` with HTTP 200 for authenticated requests.

#### Scenario: Unauthentifizierter Desktop-Nutzer wird zu Keycloak weitergeleitet *(E2E)*
- **GIVEN** ein Nutzer ohne gültige Keycloak-Session öffnet den Brett-Client
- **WHEN** der Browser `brett.<domain>/` lädt
- **THEN** wird die URL zu `auth.<domain>/realms/workspace` (Keycloak-Login) weitergeleitet (Timeout 15 s)

#### Scenario: Unauthentifizierter mobiler Nutzer wird zu Keycloak weitergeleitet *(E2E)*
- **GIVEN** ein mobiler Browser (Android/Pixel-5-Viewport) ohne Keycloak-Session
- **WHEN** der Brett-Client aufgerufen wird
- **THEN** wird der Browser auf die Keycloak-Login-URL weitergeleitet

#### Scenario: Mentolder-Admin-Login via Keycloak schreibt Auth-State *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt und `brett.mentolder.de` ist erreichbar
- **WHEN** der Setup-Schritt `loginViaKeycloak` mit Admin-Credentials ausgeführt wird
- **THEN** speichert Playwright den Session-State unter `.auth/mentolder-brett.json`; ein anschließender Request auf `/healthz` liefert HTTP 200

#### Scenario: Brett Health-Endpunkt antwortet mit 200 *(E2E)*
- **GIVEN** der Brett-Pod läuft
- **WHEN** `GET /healthz` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200

---

### Requirement: Brett-Service-API (REST-Endpunkte)
<!-- e2e: fa-27-brett.spec.ts -->

The system SHALL expose stable REST endpoints (`/api/state`, `/api/snapshots`, `/api/customers`, `/presets`) with correct HTTP status codes and JSON schemas.

#### Scenario: `/api/state` liefert JSON-Figuren-Array für unbekannten Raum *(E2E)*
- **GIVEN** ein Raum-Token ist dem System unbekannt
- **WHEN** `GET /api/state?room=<unbekannter-token>` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Objekt, das eine leere `figures`-Array-Property enthält

#### Scenario: Statisches Asset `/three.min.js` wird ausgeliefert *(E2E)*
- **GIVEN** der Brett-Server läuft
- **WHEN** `GET /three.min.js` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200

#### Scenario: `POST /api/snapshots` legt Snapshot an *(E2E)*
- **GIVEN** ein gültiger `room_token`, `name` und `state`-Body werden übergeben
- **WHEN** `POST /api/snapshots` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 oder 201 und einem JSON-Objekt mit `id`-Property

#### Scenario: `GET /api/snapshots` ohne Parameter liefert 400 *(E2E)*
- **GIVEN** keine Query-Parameter
- **WHEN** `GET /api/snapshots` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 400 und einem JSON-Objekt mit `error`-Property

#### Scenario: `GET /api/snapshots` mit Raum-Parameter liefert Array *(E2E)*
- **GIVEN** ein Raum-Token wird als Query-Parameter übergeben
- **WHEN** `GET /api/snapshots?room=<token>` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Array

#### Scenario: `GET /api/snapshots/:id` liefert 404 für unbekannte UUID *(E2E)*
- **GIVEN** eine nicht existierende UUID
- **WHEN** `GET /api/snapshots/00000000-0000-0000-0000-000000000000` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 404

#### Scenario: `POST /api/snapshots` validiert fehlende `state.figures` *(E2E)*
- **GIVEN** ein Request-Body ohne `state.figures`-Feld
- **WHEN** `POST /api/snapshots` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 400 und einer Fehlermeldung, die `state.figures` erwähnt

#### Scenario: `GET /api/customers` liefert Array *(E2E)*
- **GIVEN** der Brett-Server läuft
- **WHEN** `GET /api/customers` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Array

#### Scenario: `GET /presets` liefert Array *(E2E)*
- **GIVEN** der Brett-Server läuft
- **WHEN** `GET /presets` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Array

---

### Requirement: Rollenbasierte Mutationsrechte (server-seitige Durchsetzung)
<!-- e2e: brett-roles.spec.ts -->

The system SHALL enforce role-based permissions on the server side, so that a participant with the `beobachter` role cannot move figures even if they hold an OIDC admin claim — enforcement is keyed on the assigned role, not on the OIDC claim.

#### Scenario: Beobachter kann keine Figur bewegen (server-seitig erzwungen) *(E2E)*
- **GIVEN** zwei authentifizierte Clients sind im selben Raum: einer als `leiter` (Admin-Token-Inhaber), einer explizit als `beobachter` zugewiesen (obwohl ebenfalls OIDC-Admin)
- **WHEN** der Beobachter eine `move`-Nachricht für eine vorhandene Figur über WebSocket sendet
- **THEN** empfängt der Beobachter eine `error`-Nachricht vom Server; die Figur-Position auf dem Leiter-Client bleibt unverändert

---

### Requirement: Share-Link (View-only-Zugang ohne Keycloak)
<!-- e2e: brett-share-link.spec.ts -->

The system SHALL allow a session leader to generate a share link (`/share/<token>`) that grants read-only board access to users without a Keycloak account, and SHALL display an error for invalid or expired tokens.

#### Scenario: Leiter erstellt Share-Link; Gast sieht Board im Read-only-Modus *(E2E)*
- **GIVEN** ein authentifizierter Leiter hat eine Session erstellt und klickt den Share-Button
- **WHEN** der generierte Link von einem Nutzer ohne Keycloak-Session geöffnet wird
- **THEN** sieht der Gast ein `#view-only-badge` und das 3D-Canvas; der `#fig-panel-btn` (Mutationsschaltfläche) ist nicht vorhanden

#### Scenario: Ungültiger Share-Token zeigt Fehlermeldung *(E2E)*
- **GIVEN** ein Nutzer öffnet `/share/this-token-does-not-exist`
- **WHEN** die Seite geladen wird
- **THEN** zeigt die Seite einen Text, der „ungültig" oder „nicht mehr gültig" enthält

---

### Requirement: Mannequin-Figuren-Interaktion (3D-Client)
<!-- e2e: brett-mannequin.spec.ts -->

The system SHALL seed a room with an initial figure, allow adding further figures via button or double-click, support preset application, stiffness adjustment, Tab-based selection cycling, and Delete-key removal.

#### Scenario: Beim Laden ist eine Startfigur vorhanden *(E2E)*
- **GIVEN** ein neuer Raum wird geöffnet
- **WHEN** `window.STATE` verfügbar ist
- **THEN** enthält `STATE.figures` genau ein Element

#### Scenario: Schaltfläche „Figur hinzufügen" vergrößert Figurliste *(E2E)*
- **GIVEN** ein Raum mit einer Figur ist geöffnet
- **WHEN** `#add-figure` geklickt wird
- **THEN** enthält `STATE.figures` zwei Elemente

#### Scenario: Preset „Kneel" setzt Zielrotation korrekt *(E2E)*
- **GIVEN** eine Figur ist ausgewählt
- **WHEN** der `button[data-preset="kneel"]` geklickt wird
- **THEN** hat `figure.bone.lHip.targetRot.x` einen Wert nahe -1,3

#### Scenario: Steifigkeitsregler aktualisiert `STATE.stiffness` *(E2E)*
- **GIVEN** der Raum ist geöffnet
- **WHEN** der `#stiffness`-Slider auf 0.1 gesetzt wird
- **THEN** ist `STATE.stiffness === 0.1`

#### Scenario: Doppelklick auf den Boden fügt Figur hinzu *(E2E)*
- **GIVEN** ein Raum ist geöffnet
- **WHEN** auf das `<canvas>`-Element doppelgeklickt wird
- **THEN** ist die Anzahl der Figuren in `STATE.figures` größer als zuvor

#### Scenario: Tab-Taste wechselt die Auswahl zur nächsten Figur *(E2E)*
- **GIVEN** zwei Figuren existieren; die erste ist ausgewählt
- **WHEN** die Tab-Taste gedrückt wird
- **THEN** wechselt `STATE.selectedId` auf die ID der zweiten Figur

#### Scenario: Delete-Taste entfernt die ausgewählte Figur *(E2E)*
- **GIVEN** zwei Figuren existieren
- **WHEN** die Delete-Taste gedrückt wird
- **THEN** ist die Anzahl der Figuren in `STATE.figures` um eins kleiner

---

### Requirement: Mobile-Darstellung und Favicon
<!-- e2e: brett-mobile.spec.ts -->

The system SHALL render the 3D canvas to fill at least 90 % of the mobile viewport width, use a data-URI favicon so no additional HTTP request for `/favicon.ico` is triggered, and handle touch events without JavaScript errors.

#### Scenario: Favicon ist ein Data-URI (kein HTTP-Request für `/favicon.ico`) *(E2E)*
- **GIVEN** ein authentifizierter Nutzer öffnet Brett auf einem mobilen Viewport
- **WHEN** die Seite geladen wird
- **THEN** sendet der Browser keinen Request auf `/favicon.ico`; `<link rel="icon">` enthält einen `data:image/svg+xml`-URI

#### Scenario: Canvas füllt mindestens 90 % der Viewport-Breite auf Mobilgeräten *(E2E)*
- **GIVEN** ein mobiler Browser (Pixel-5-Viewport, 393 px Breite)
- **WHEN** Brett mit einem Raum-Token geladen wird
- **THEN** ist die `offsetWidth` des `<canvas>`-Elements ≥ 90 % der `window.innerWidth`

---

### Requirement: Semantic Code Search — Indexer (SCS-1)
<!-- bats: scs-index.bats -->

The system SHALL maintain a `scripts/index-repo.ts` indexer that creates `code_embeddings` and `file_dependencies` tables with pgvector support, uses the `bge-m3` model (1024 dimensions), supports incremental re-indexing via `--file` flag and SHA-256 hashing, and excludes `node_modules`/`dist`.

#### Scenario: `index-repo.ts` existiert und ist nicht leer *(BATS)*
- **GIVEN** das Repo-Verzeichnis enthält `scripts/index-repo.ts`
- **WHEN** die Datei auf Existenz und Nicht-Leerheit geprüft wird
- **THEN** sind beide Bedingungen erfüllt

#### Scenario: `index-repo.ts` enthält DDL für `code_embeddings` *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach dem Token `code_embeddings` durchsucht wird
- **THEN** erscheint das Token mindestens 3-mal

#### Scenario: `index-repo.ts` enthält DDL für `file_dependencies` *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach dem Token `file_dependencies` durchsucht wird
- **THEN** erscheint das Token mindestens 2-mal

#### Scenario: Embedding-Dimension ist `EMBED_DIM` (bge-m3 = 1024) *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `EMBED_DIM` durchsucht wird
- **THEN** erscheint das Token mindestens 2-mal

#### Scenario: `--file`-Flag für inkrementellen Reindex vorhanden *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `--file` durchsucht wird
- **THEN** erscheint das Flag mindestens einmal

#### Scenario: `bge-m3`-Modell-Referenz ist vorhanden *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `bge-m3` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: Import-Extraktion für Abhängigkeitsgraph ist implementiert *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `extractImports` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: `node_modules` und `dist` werden ignoriert *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei auf Ausschluss-Muster durchsucht wird
- **THEN** enthalten beide Muster (`node_modules`, `'dist'`) mindestens einen Treffer

#### Scenario: YAML wird separat gechunked *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `chunkYaml` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: SHA-256-Hashing für inkrementelles Indexing *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `sha256` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: `ivfflat`-Index für Kosinus-Ähnlichkeit ist vorhanden *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `ivfflat` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: UNIQUE-Constraint auf `(file_path, chunk_index)` *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `UNIQUE(file_path, chunk_index)` durchsucht wird
- **THEN** ist mindestens ein Treffer vorhanden

---

### Requirement: Semantic Code Search — Such-API und UI (SCS-2 bis SCS-5)
<!-- bats: scs-search.bats | e2e: fa-scs-scout.spec.ts -->

The system SHALL expose a `GET /api/codesearch` endpoint (admin-only, query param `q`) backed by `codesearch-db.ts` using pgvector cosine distance; support augmented search with 1-hop file-dependency neighbors (score 0.7); display results with a score-colour function in the Factory DetailPanel; and trigger incremental re-indexing via a `post-commit-index` hook.

#### Scenario: `codesearch.ts` API-Route existiert *(BATS)*
- **GIVEN** das Repo enthält `website/src/pages/api/codesearch.ts`
- **WHEN** die Datei auf Existenz geprüft wird
- **THEN** ist die Bedingung erfüllt

#### Scenario: Codesearch-API erfordert Admin-Authentifizierung *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** die Datei nach `isAdmin` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: Codesearch-API validiert Query-Parameter `q` *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** die Datei nach `searchParams.get('q')` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: Codesearch-API liefert 503 wenn Embedding-Dienst nicht verfügbar *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** die Datei nach dem Fehlertext `embedding service unavailable` durchsucht wird
- **THEN** erscheint der Text mindestens einmal

#### Scenario: Augmented-Query-Parameter ist implementiert *(BATS)*
- **GIVEN** `website/src/pages/api/codesearch.ts` ist vorhanden
- **WHEN** die Datei nach `augmented` durchsucht wird
- **THEN** erscheint das Token mindestens 2-mal

#### Scenario: `codesearch-db.ts` hat `searchCode`-Funktion *(BATS)*
- **GIVEN** `website/src/lib/codesearch-db.ts` ist vorhanden
- **WHEN** die Datei nach `export async function searchCode` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: Kosinus-Distanz-Operator `<=>` ist in DB-Modul verwendet *(BATS)*
- **GIVEN** `website/src/lib/codesearch-db.ts` ist vorhanden
- **WHEN** die Datei nach dem Operator `<=>` durchsucht wird
- **THEN** erscheint der Operator mindestens einmal

#### Scenario: `searchCodeAugmented` fragt 1-Hop-Nachbarn aus `file_dependencies` ab *(BATS)*
- **GIVEN** `website/src/lib/codesearch-db.ts` ist vorhanden
- **WHEN** die Datei nach `file_dependencies` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: Augmentierte Nachbarn erhalten Score 0.7 *(BATS)*
- **GIVEN** `website/src/lib/codesearch-db.ts` ist vorhanden
- **WHEN** die Datei nach `score: 0.7` durchsucht wird
- **THEN** ist mindestens ein Treffer vorhanden

#### Scenario: `DetailPanel.svelte` zeigt `suggested_files`-Sektion *(BATS)*
- **GIVEN** `website/src/components/factory/DetailPanel.svelte` ist vorhanden
- **WHEN** die Datei nach `suggested_files` durchsucht wird
- **THEN** erscheint das Token mindestens 2-mal

#### Scenario: `DetailPanel.svelte` hat `scoreColor`-Funktion *(BATS)*
- **GIVEN** `website/src/components/factory/DetailPanel.svelte` ist vorhanden
- **WHEN** die Datei nach `scoreColor` durchsucht wird
- **THEN** erscheint das Token mindestens einmal

#### Scenario: `post-commit-index`-Hook existiert und ist ausführbar *(BATS)*
- **GIVEN** das Repo enthält `.githooks/post-commit-index`
- **WHEN** Existenz und Ausführbarkeit geprüft werden
- **THEN** sind beide Bedingungen erfüllt

#### Scenario: `post-commit-index` filtert auf indexierbare Dateiendungen *(BATS)*
- **GIVEN** `.githooks/post-commit-index` ist vorhanden
- **WHEN** die Datei nach indexierbaren Endungen (`ts`, `svelte`, `astro`, `yaml`) durchsucht wird
- **THEN** erscheint mindestens ein Treffer

#### Scenario: `scs:index`- und `scs:search`-Tasks sind im Taskfile definiert *(BATS)*
- **GIVEN** `Taskfile.yml` ist vorhanden
- **WHEN** die Datei nach `scs:index` und `scs:search` durchsucht wird
- **THEN** erscheinen beide Token jeweils mindestens einmal

#### Scenario: Factory-Scout-Phase injiziert `suggested_files` in DetailPanel *(E2E)*
- **GIVEN** die Factory-Floor-API liefert für Ticket T000628 (Scout-Phase) eine `suggested_files`-Liste mit drei Einträgen (`scripts/index-repo.ts`, `codesearch-db.ts`, `codesearch.ts`)
- **WHEN** der Nutzer das Ticket in der Factory-Floor-UI öffnet
- **THEN** zeigt das `DetailPanel` einen „Semantisch verwandte Dateien"-Abschnitt mit den drei Einträgen und ihren Score-Werten an
