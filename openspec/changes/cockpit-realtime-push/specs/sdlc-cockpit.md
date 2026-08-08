## MODIFIED Requirements

### Requirement: D10 — Panel-deklarierte Refresh-Rate

The adapter SHALL accept a `refreshMs` parameter per method call. For sources that
carry no push channel, the adapter SHALL poll at that interval. For sources served
by the notification stream, `refreshMs` SHALL be accepted and ignored, and the
adapter SHALL deliver updates when the stream emits them.

The set of poll-served sources SHALL be limited to those with no PostgreSQL
origin — pod state (kubectl), CI runs (GitHub) and model health (Ollama). Every
poll-served source SHALL be named in the action and source inventory together
with the reason it cannot be pushed.

#### Scenario: refreshMs is honoured for a poll-served source

- **GIVEN** the adapter is called as `data.cluster({ refreshMs: 5000 })`
- **WHEN** 10 seconds pass
- **THEN** at least 2 fetches were issued for that source

#### Scenario: A push-served source does not poll

- **GIVEN** the adapter is called as `data.tickets({ refreshMs: 5000 })` and the
  notification stream is connected
- **WHEN** 10 seconds pass without any notification
- **THEN** no fetch was issued for that source

## ADDED Requirements

### Requirement: Cockpit sources resolve against the SDLC build target

Every website-served endpoint in the adapter's endpoint map SHALL resolve to a
route that exists in `website/src/pages/sdlc/`. An endpoint entry whose path has
no corresponding route file SHALL NOT be shipped.

This requirement exists because the build target split (T002624) moved the SDLC
routes and the adapter kept pointing at the retired `/api/admin/cockpit/*` paths,
which turned every panel fetch into a 404 that the adapter reported as an
unreachable source.

#### Scenario: Every mapped website endpoint has a route

- **GIVEN** the adapter's endpoint map
- **WHEN** each entry marked `website: true` is resolved against the repository
- **THEN** a route file exists for its path under `website/src/pages/sdlc/`

#### Scenario: A retired path is not reachable

- **GIVEN** the retired prefix `/api/admin/cockpit/`
- **WHEN** the adapter's endpoint map is inspected
- **THEN** no entry uses that prefix

### Requirement: Database changes reach the cockpit as notifications

The system SHALL emit a PostgreSQL notification when the tables backing the
cockpit change — factory phase events, cockpit audit entries and ticket status
transitions. The notification payload SHALL name the affected domain and SHALL
stay small enough to survive the payload limit; consumers SHALL re-read the
authoritative row rather than trust the payload as a full record.

#### Scenario: A phase event produces a notification

- **GIVEN** a listener holds `LISTEN` on the cockpit channel
- **WHEN** a row is inserted into `tickets.factory_phase_events`
- **THEN** the listener receives a notification naming the factory domain

#### Scenario: The payload stays within the limit

- **GIVEN** a row whose textual content exceeds the notification payload limit
- **WHEN** the trigger fires
- **THEN** the notification is delivered and carries identifying fields, not the
  full row

### Requirement: The notification stream is served by the website under admin session

The system SHALL expose the cockpit event stream as a server-sent-event route in
the SDLC build target. The route SHALL reject a request without a valid admin
session. The route SHALL send a heartbeat so an idle connection is
distinguishable from a broken one, and SHALL release its resources when the
client disconnects.

A single listening connection SHALL serve all connected cockpit clients; the
route SHALL NOT open one database connection per browser.

#### Scenario: An unauthenticated request is rejected

- **GIVEN** a request to the stream route without an admin session
- **WHEN** the route handles it
- **THEN** it responds 401 and opens no stream

#### Scenario: Two clients share one listening connection

- **GIVEN** the stream route is serving one connected client
- **WHEN** a second client connects
- **THEN** the number of listening database connections stays at one

#### Scenario: A disconnect releases the subscription

- **GIVEN** a connected client
- **WHEN** the client disconnects
- **THEN** its subscription is removed and its timers are cleared

### Requirement: The adapter contract is unchanged by the switch to push

The adapter SHALL keep the method signatures and the returned handle shape
(`subscribe`, `data`) that the panel runtime consumes. A panel SHALL NOT need to
know whether its source is served by poll or by notification.

Where a source is push-served, the panel runtime SHALL NOT additionally run its
own refresh timer for that source.

#### Scenario: The handle shape is stable

- **GIVEN** a push-served adapter method
- **WHEN** it is called
- **THEN** it returns a handle exposing `subscribe` and `data`, as the poll
  implementation did

#### Scenario: No double delivery

- **GIVEN** a panel bound to a push-served source
- **WHEN** the panel is mounted
- **THEN** no refresh timer is running for that panel

### Requirement: Frequently used SDLC actions are reachable from the cockpit

The system SHALL make the following actions executable from the cockpit:
the six existing ticket and feature endpoints (`feature-action`,
`feature-actions`, `batch`, `reorder`, `reparent`, `suggest`); factory control
(tick, enqueue, slot release); deploy and CI (Flux reconcile, CI rerun); and the
ticket lifecycle (stage plan, release hold, close).

Every action SHALL be classified by reversibility in the action policy. An action
that is not classified SHALL be treated as irreversible. Every execution SHALL be
recorded in `tickets.cockpit_audit` with actor, action, target and outcome —
including failed attempts.

#### Scenario: An unclassified action is treated as irreversible

- **GIVEN** an action name absent from the policy's classification
- **WHEN** the policy is asked to classify it
- **THEN** it returns the irreversible class and requires a confirmation naming
  the target

#### Scenario: A failed action is still recorded

- **GIVEN** an action whose execution fails
- **WHEN** the request completes
- **THEN** an audit row exists with outcome `failure`

#### Scenario: An action requires an admin session

- **GIVEN** a request to an action endpoint without an admin session
- **WHEN** the endpoint handles it
- **THEN** it responds 401 and performs no write

### Requirement: Reachability of exposed actions is demonstrated, not asserted

The system SHALL carry an inventory naming every action exposed to the cockpit
with its endpoint, its reversibility class and its audit behaviour. The inventory
SHALL be covered by a test that invokes each listed action and checks the
observed result — the presence of an entry in the document SHALL NOT by itself
count as evidence of reachability.

#### Scenario: Every inventory entry resolves to a route

- **GIVEN** the action inventory
- **WHEN** each entry's endpoint is resolved against the repository
- **THEN** a route file exists for it and the route accepts the documented method

#### Scenario: An inventory entry without a classification fails the check

- **GIVEN** an inventory entry carrying no reversibility class
- **WHEN** the inventory check runs
- **THEN** it fails and names the entry

### Requirement: The cockpit header reports its actual data source

The cockpit SHALL indicate whether it is serving live data or fixtures based on
the adapter's actual state. A fixed label SHALL NOT be used.

#### Scenario: Live data is labelled as live

- **GIVEN** the adapter is serving live endpoints
- **WHEN** the cockpit header renders
- **THEN** it does not claim fixture mode
