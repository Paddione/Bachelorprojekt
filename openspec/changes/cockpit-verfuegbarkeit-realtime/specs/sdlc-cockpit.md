## ADDED Requirements

### Requirement: Dev-Deployment — SDLC-Console auf mentolder-dev-Cluster

Das Repository SHALL einen ausführbaren Deployment-Pfad bereitstellen, der das
SDLC-Cockpit auf einem dedizierten k3d-Cluster `mentolder-dev` erreichbar macht
(`Taskfile.sdlc.yml` `sdlc:cluster:create` + `sdlc:deploy`). Das Ergebnis SHALL
per BATS-Test nachgewiesen sein, nicht per Behauptung.

#### Scenario: SDLC-Stack ist deployed und erreichbar

- **GIVEN** der `mentolder-dev`-Cluster läuft und der SDLC-Stack wurde per `sdlc:deploy` ausgerollt
- **WHEN** `GET http://sdlc.localhost/sdlc/cockpit` aufgerufen wird
- **THEN** antwortet die SDLC-Console mit HTTP 200 oder einem gültigen Auth-Redirect
- **AND** der BATS-Test `tests/spec/cockpit-availability/*.bats` läuft grün

#### Scenario: Cluster-Ziel ist dokumentiert

- **GIVEN** die Deployment-Doku des SDLC-Stacks
- **WHEN** der Zielcluster nachgeschlagen wird
- **THEN** heißt er `mentolder-dev` und der Ausführungspfad ist `task sdlc:cluster:create` gefolgt von `task sdlc:deploy`

### Requirement: Dev-Login — OAuth-Client für die lokale Website

Der lokale Login-Pfad SHALL funktionieren: Der Pocket-ID-Client `website` SHALL den
Callback `http://web.localhost/api/auth/callback` akzeptieren, und die Dev-`SITE_URL`
SHALL konsistent mit diesem Callback sein, sodass `GET /sdlc/cockpit` ohne
*"OAuth 2.0 Client does not exist"* bis zum authentifizierten Cockpit führt.

#### Scenario: Admin meldet sich lokal an und erreicht das Cockpit

- **GIVEN** ein Admin-Benutzer existiert im lokalen Pocket ID
- **WHEN** der Benutzer `http://localhost:4321/sdlc/cockpit` öffnet und sich über den OAuth-Flow anmeldet
- **THEN** endet der Flow im Cockpit (kein OAuth-Client-Fehler)
- **AND** die Session gilt als gültige Admin-Session

### Requirement: Header-Status spiegelt Livedaten statt Fixtures

Das Cockpit-Header-Badge SHALL den realen Datenmodus (Livedaten) anzeigen und nicht mehr
"Fixtures (K1)", sobald `adapter.js` Livedaten liefert.

#### Scenario: Badge zeigt Livedaten

- **GIVEN** das Cockpit lädt mit einem konfigurierten Adapter, der Livedaten liefert
- **WHEN** der Header gerendert wird
- **THEN** zeigt das Status-Element den Livedaten-Status an
- **AND** es zeigt nicht "Fixtures (K1)"

### Requirement: Realtime-Push — LISTEN/NOTIFY-SSE statt Polling

DB-gestützte Cockpit-Domänen (Tickets, Audit, Factory-Phasen) SHALL über
PostgreSQL `LISTEN/NOTIFY` als Event-Quelle in Echtzeit aktualisiert werden. Die
Website-API SHALL einen SSE-Endpunkt `/api/admin/cockpit/stream` mit Admin-Session-Auth
bereitstellen, der DB-Events an verbundene Cockpit-Clients fan-out. Polling SHALL nur noch
für Quellen ohne Postgres-Quelle (Pods, CI/GitHub, Modell-Health) als Fallback dienen.

#### Scenario: DB-Event wird an verbundene Clients gepusht

- **GIVEN** ein Admin-Client ist mit `/api/admin/cockpit/stream` verbunden
- **WHEN** ein Trigger ein `NOTIFY` auf dem Ticket-Kanal auslöst
- **THEN** erhält der Client ein SSE-Event mit den geänderten Daten
- **AND** das Poll-Intervall der betroffenen Panel wird nicht abgewartet

#### Scenario: Nicht-push-fähige Quelle bleibt gepollt

- **GIVEN** eine Pod-/CI-Quelle besitzt keine Postgres-Quelle
- **WHEN** das zugehörige Panel aktualisiert wird
- **THEN** erfolgt die Aktualisierung über das bestehende Polling

### Requirement: SDLC-Aktionsknöpfe und Aktions-Inventur

Die vorhandenen, aber nicht exponierten POST-Endpunkte (feature-action, feature-actions,
batch, reorder, reparent, suggest) SHALL im Cockpit erreichbar sein. Jede freigeschaltete
Aktion SHALL in einer Inventur (`docs/sdlc/cockpit-action-inventory.md`) mit
`action-policy.js`-Klassifikation dokumentiert und per BATS-Test auf Erreichbarkeit
belegt werden. Schreibaktionen SHALL in `tickets.cockpit_audit` protokolliert werden.

#### Scenario: Aktion ist freigeschaltet und auditiert

- **GIVEN** eine Admin-Session ist aktiv und die Aktion "feature-action" ist freigeschaltet
- **WHEN** die Aktion über das Cockpit ausgelöst wird
- **THEN** wird der POST-Endpunkt erfolgreich aufgerufen
- **AND** der Vorgang erscheint im Audit-Log `tickets.cockpit_audit`
- **AND** der BATS-Test `tests/spec/sdlc-cockpit/action-inventory.bats` läuft grün
