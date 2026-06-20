# brett

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Systemisches Brett ist ein browserbasiertes 3D-Konstellationsboard für systemische Coaching-Arbeit. Es läuft als einzelner Node.js-Pod (`workspace-brett`) und verbindet statische HTML-Auslieferung, WebSocket-Echtzeitsynchronisation und REST-Persistenz auf Port 3000. Alle Figuren-Zustände werden im Shared-PostgreSQL (`brett_rooms`-Tabelle) persistiert; das In-Memory-Figuremap ist der primäre Zustandsspeicher während einer Session.

---

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
