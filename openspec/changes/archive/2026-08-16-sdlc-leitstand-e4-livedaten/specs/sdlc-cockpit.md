# Delta: sdlc-cockpit — E4 Live-Daten & Lücken

## ADDED Requirements

### Requirement: Live Platform Deck

Das Plattform-Deck zeigt ausschließlich echte Datenquellen; die Platzhalterseite mit
hartcodierten Uptime-Zahlen stirbt und leitet auf den Leitstand um.

The system SHALL source every metric shown in the Plattform deck (Z5) from a real backend
(`/sdlc/api/` routes backed by `lib/sdlc/k8s.ts`, `lib/sdlc/factory-observability.ts` or
Prometheus) and SHALL NOT render hardcoded availability numbers anywhere in the SDLC build. The
route `/sdlc/observability` SHALL 301-redirect to `/sdlc/cockpit?deck=plattform` via the
middleware redirect map. Each deck section SHALL fail soft: a failing data source hides or marks
only its own section (with the explicit `error` field per D12/D13) and never substitutes
placeholder values.

#### Scenario: Observability page redirects

- **GIVEN** a request to `/sdlc/observability`
- **WHEN** the middleware resolves the path
- **THEN** the response is a 301 redirect to `/sdlc/cockpit?deck=plattform`
- **AND** no page file `pages/sdlc/observability.astro` exists in the build

#### Scenario: Failing source shows error, not placeholder

- **GIVEN** the Prometheus backend is unreachable
- **WHEN** the Plattform deck renders
- **THEN** the affected section shows its error state
- **AND** no hardcoded fallback number is displayed

### Requirement: DORA KPI Idle Grid

Die Kontextzone zeigt im Leerlauf ein KPI-Raster inklusive DORA-Kennzahlen aus den
Delivery-Metriken; die bisher verwaiste Delivery-Auswertung geht darin auf.

The system SHALL render, when no station and no ticket is selected, a KPI grid in the Z4
Kontextzone that includes DORA metrics (deployment frequency, lead time, change failure rate)
computed from `/sdlc/api/delivery-metrics` by pure aggregation functions in
`components/website/src/lib/sdlc/leitstand-kpi.ts`. The grid response SHALL carry `fetchedAt`
and an explicit `error` field. The orphaned `DeliveryHistory.svelte` component SHALL be removed.

#### Scenario: Idle state shows DORA KPIs

- **GIVEN** the cockpit is loaded without `station` or `ticket` parameters
- **WHEN** Z4 renders
- **THEN** the KPI grid appears and contains DORA metric tiles fed by the delivery-metrics API

#### Scenario: Aggregation is pure and tested

- **GIVEN** a fixed array of delivery-metric rows
- **WHEN** the aggregation functions in `leitstand-kpi.ts` run
- **THEN** they return deterministic DORA values without performing any I/O

### Requirement: Factory Floor Stream via LISTEN

Der Factory-Floor-SSE-Stream wird von PG-Ereignissen getrieben statt von einem festen
Poll-Intervall; Polling bleibt nur als Fallback ohne NOTIFY-Verbindung.

The system SHALL drive the SSE endpoint `pages/sdlc/api/factory-floor/stream.ts` from
`lib/sdlc/cockpit-listen-hub.ts` subscriptions (PostgreSQL LISTEN/NOTIFY) instead of a fixed
`setInterval` data poll. A poll-based refresh SHALL remain only as fallback while no NOTIFY
connection is available, and heartbeat frames MAY keep using a timer. Reconnect events from the
hub SHALL trigger a full snapshot push to connected clients.

#### Scenario: Ticket event pushes floor update

- **GIVEN** a client is connected to the factory-floor stream
- **WHEN** a `cockpit_events` NOTIFY fires for a ticket change
- **THEN** the endpoint pushes a fresh floor payload without waiting for a poll interval

#### Scenario: Fallback poll without NOTIFY

- **GIVEN** the listen hub cannot establish its PG connection
- **WHEN** the stream endpoint serves a client
- **THEN** it falls back to interval-based refresh so the stream stays functional

### Requirement: API Catalog UI

Das Wissen-Deck zeigt den generierten API-/Connector-Katalog durchsuchbar an, mit
Live-Health-Anzeige für die HTTP-MCP-Server über eine server-seitige Proxy-Route.

The system SHALL render the E2-generated `components/website/src/data/api-inventory.json` in the
Wissen deck as a searchable catalog (`ApiKatalog.svelte`) offering text search, grouping by path
prefix, HTTP-method badges and backend classification labels. For the HTTP MCP servers in the
inventory, the UI SHALL show a live health indicator fed by a server-side route
`/sdlc/api/mcp-health` that probes the servers' existing health endpoints; the browser SHALL NOT
probe MCP ports directly. The health response SHALL carry `fetchedAt` and per-server status with
an explicit `error` field.

#### Scenario: Catalog search narrows entries

- **GIVEN** the Wissen deck shows the API catalog
- **WHEN** the user types a search term matching three route paths
- **THEN** only those three entries remain visible, grouped under their path prefixes

#### Scenario: MCP health is proxied server-side

- **GIVEN** the catalog shows an HTTP MCP server entry
- **WHEN** its health indicator updates
- **THEN** the data originates from `/sdlc/api/mcp-health`
- **AND** no browser request targets an MCP port directly
