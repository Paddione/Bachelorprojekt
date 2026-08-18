## ADDED Requirements

### Requirement: E2E assertions anchor on the SDLC Leitstand zones

The E2E spec for the admin cockpit SHALL assert the SDLC Leitstand via its
heading "SDLC Leitstand" and the stable zone test-ids
(`leitstand-statusband`, `leitstand-kontextzone`, `leitstand-deck-leiste`)
instead of the removed `#panel-pipeline` and the superseded "SDLC Cockpit"
heading; the `/admin/tickets` route alias SHALL be verified via its 301
redirect to `/sdlc/cockpit`.

#### Scenario: Cockpit page renders the Leitstand zones

- **GIVEN** an authenticated admin session
- **WHEN** the user navigates to `/sdlc/cockpit`
- **THEN** the page shows the heading "SDLC Leitstand" and the zone test-ids statusband, kontextzone and deck-leiste are present

#### Scenario: Route alias redirects to the Leitstand

- **GIVEN** an authenticated admin session
- **WHEN** the user navigates to `/admin/tickets`
- **THEN** the browser is redirected to `/sdlc/cockpit` and the Leitstand heading is shown

### Requirement: Stale Leitstand fetches are aborted

Async fetches triggered by fast user selection (factory-floor detail panel,
OpenSpec search deck) SHALL abort the previous in-flight request when a new
one starts, so out-of-order resolution cannot overwrite newer results.

#### Scenario: Rapid selection keeps the latest result

- **GIVEN** the factory-floor detail panel is open
- **WHEN** the user selects ticket B shortly after ticket A while A's CI fetch is still in flight
- **THEN** the fetch for A is aborted and the panel shows the CI data of B

#### Scenario: Deck switch cancels a running OpenSpec search

- **GIVEN** the OpenSpec search in the Wissen deck is running
- **WHEN** the user switches to another deck before the response arrives
- **THEN** the in-flight request is aborted on unmount and no stale results are rendered

### Requirement: Leitstand metrics stay unconnected until E4 observability

`leitstand-metrics.ts` SHALL remain without a production import and be
covered solely by vitest until E4 observability wires the Z1 status-band
live data; the decision SHALL be documented in the file header.

#### Scenario: Metrics module has no production consumer

- **GIVEN** the sdlc source tree
- **WHEN** checking the imports of `leitstand-metrics.ts`
- **THEN** the only consumer is its vitest spec and the file header documents the E4 decision
