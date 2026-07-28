# Delta Spec: K2 — Daten-Adapter & lokaler Daemon

> Parent SSOT: `sdlc-cockpit` (T002458/K1, noch nicht auf main — in PR #3518)
> Änderungstyp: ADDED (K2 fügt dem Cockpit-System den Daemon und Live-Daten hinzu)

## ADDED Requirements

### Requirement: Adapter-Vertragstreue (E1)

The K2 adapter SHALL expose the same 8 methods as the K1 fixture adapter (`tickets`, `agents`, `ci`,
`cluster`, `factory`, `models`, `ticketAction`, `agentAction`) with identical signatures, so that
no panel code changes when K1 fixtures are replaced with K2 live data.

#### Scenario: Methoden-Signaturen identisch

- **GIVEN** der K1-Fixture-Adapter mit 6 Read- und 2 Write-Methoden
- **WHEN** der K2-Adapter geladen wird
- **THEN** sind alle 8 Methoden mit denselben Namen und Rückgabetypen vorhanden
- **AND** `typeof data.tickets === 'function'` ist wahr
- **AND** `typeof data.agents === 'function'` ist wahr

#### Scenario: Kein direkter fetch-Aufruf in Panels

- **GIVEN** alle Panel-Dateien unter `.lavish/kit/` und `.lavish/`
- **WHEN** nach `fetch(` oder `XMLHttpRequest` gesucht wird
- **THEN** kommt kein Treffer außerhalb von `adapter.js` oder `daemon/`
- **AND** mindestens ein `fetch(`-Aufruf existiert in `adapter.js` **als Positiv-Anker** (T002356-M1)

---

### Requirement: Livedaten statt Fixtures

The daemon SHALL serve real data from `kubectl --context fleet`, `gh-axi`, `git`, `agent-lock.sh`,
`ticket-mcp`, `factory-mcp`, and opencode.db, replacing all K1 fixture arrays.

#### Scenario: Cluster-Daten sind live

- **GIVEN** der Daemon läuft auf Port 49152
- **WHEN** `GET /api/admin/cluster/pods-list?namespace=workspace` aufgerufen wird
- **THEN** enthält die Antwort `fetchedAt` (ISO 8601 Timestamp)
- **AND** die Antwort enthält echte Pod-Daten (nicht die K1-Fixtures mit `ollama-llama-cpp-7f9d6`)
- **AND** kein `error`-Feld, wenn `kubectl` erreichbar ist

#### Scenario: Agent-Daten aus agent-lock.sh

- **GIVEN** der Daemon läuft
- **WHEN** `GET /api/cockpit/agents` aufgerufen wird
- **THEN** enthält die Antwort mindestens die Felder `sid`, `label`, `ticket`, `worktree`, `status`

---

### Requirement: D12 — Aktualitäts-Timestamp

The system SHALL include a `fetchedAt` field (ISO 8601) in every response so that the panel can
display data freshness at all times, not only on error.

#### Scenario: Jede GET-Antwort hat fetchedAt

- **GIVEN** der Daemon antwortet auf einen beliebigen GET-Endpoint
- **WHEN** die Antwort geparst wird
- **THEN** ist `response.fetchedAt` ein gültiger ISO-8601-String
- **AND** `response.fetchedAt` liegt innerhalb der letzten 5 Sekunden

#### Scenario: Stale-Markierung nach Fehler

- **GIVEN** eine Datenquelle wird unerreichbar (z.B. `kubectl` timeout)
- **WHEN** der nächste Poll-Zyklus fehlschlägt
- **THEN** enthält die Antwort `error` und `staleSince`
- **AND** der letzte gültige Daten-Payload bleibt erhalten
- **AND** `fetchedAt` zeigt den Zeitpunkt des letzten erfolgreichen Fetches

---

### Requirement: D13 — Kein stiller Ersatzwert

The system SHALL never return null, a dash, or a sample value that looks like a measurement when a
data source is unreachable. Instead it SHALL return an explicit `error` field.

#### Scenario: Fehler statt Null

- **GIVEN** eine Datenquelle wirft einen Fehler
- **WHEN** der Daemon antwortet
- **THEN** enthält die Antwort ein `error`-Feld mit menschenlesbarer Beschreibung
- **AND** kein Datenfeld ist `null`, `"–"`, `-1` oder ein Beispielwert
- **AND** der Test enthält einen Positiv-Anker: zuerst wird geprüft, dass im Erfolgsfall KEIN `error`-Feld existiert (T002356-M1)

---

### Requirement: Port-Check via Health-Endpoint (E1-Ersatz)

The daemon SHALL replace the unreliable `fetch(…, {mode:'no-cors'})` port check with a proper
health endpoint probe (`GET /health`) for each model server.

#### Scenario: Port-Check erkennt 500er als Fehler

- **GIVEN** ein Dienst auf Port 8091 liefert HTTP 500 auf `/health`
- **WHEN** der Daemon den Health-Check ausführt
- **THEN** wird der Dienst als `degraded` oder `offline` markiert
- **AND** nicht als `running` (was der alte no-cors-Check tun würde)

---

### Requirement: Token für Schreibaktionen (E17)

The daemon SHALL require a Bearer token for all POST/PUT/DELETE requests and SHALL write the token
to a file with `0600` permissions at startup.

#### Scenario: POST ohne Token wird abgelehnt

- **GIVEN** der Daemon läuft
- **WHEN** `POST /api/cockpit/ticket-action` ohne `Authorization`-Header gesendet wird
- **THEN** ist der Statuscode `401`
- **AND** die Antwort enthält `error: "Token required for write actions"`

#### Scenario: Token-Datei hat enge Rechte

- **GIVEN** der Daemon wurde gestartet
- **WHEN** `stat /tmp/cockpit-daemon.token` aufgerufen wird
- **THEN** sind die Dateirechte `0600` (nur Owner les-/schreibbar)

---

### Requirement: SSE-Strom mit Lückenmarkierung

The SSE stream endpoint SHALL mark gaps when the client disconnects and reconnects, so that the
stream panel can show missing data ranges (Design Table 4.2, Typ "Strom").

#### Scenario: Lückenmarkierung nach Reconnect

- **GIVEN** ein Client ist mit `GET /api/cockpit/stream/agents` verbunden
- **WHEN** der Client die Verbindung trennt und nach 30 s wieder verbindet
- **THEN** sendet der Server ein `gap`-Event mit `from`- und `to`-Timestamp
- **AND** danach werden reguläre Events fortgesetzt

---

### Requirement: D10 — Panel-deklarierte Refresh-Rate

The adapter SHALL accept a `refreshMs` parameter per method call and SHALL poll at that interval.

#### Scenario: refreshMs wird respektiert

- **GIVEN** der Adapter wird mit `data.tickets({ refreshMs: 5000 })` aufgerufen
- **WHEN** 10 Sekunden vergehen
- **THEN** wurden mindestens 2 Fetch-Aufrufe an den Daemon gemacht

---

### Requirement: D11 — Kein Polling unsichtbarer Panels

The adapter SHALL pause all polling when `document.hidden` is true and resume when the page becomes
visible again.

#### Scenario: Polling pausiert bei hidden

- **GIVEN** ein Poll-Intervall läuft mit 1 s
- **WHEN** `document.hidden` auf `true` gesetzt wird (via `visibilitychange`)
- **THEN** wird kein weiterer Fetch-Aufruf ausgelöst
- **AND** nach `document.hidden = false` wird das Polling fortgesetzt
