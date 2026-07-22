## ADDED Requirements

### Requirement: Parallel-Status Endpoint

The system SHALL expose an admin-guarded `GET /api/factory/parallel-status` endpoint that
returns the current gang-scheduling state derived from `tickets.tickets`: the number of gang
tickets (`slot_count > 1` and claimed), the total slots claimed, the per-brand slot cap, and
the derived next scheduled tick timestamp.

#### Scenario: Unauthenticated request is rejected

- **GIVEN** a request without a valid session
- **WHEN** `GET /api/factory/parallel-status` is called
- **THEN** the endpoint responds with HTTP 401 and does not query the database

#### Scenario: Non-admin request is rejected

- **GIVEN** a request with a valid but non-admin session
- **WHEN** `GET /api/factory/parallel-status` is called
- **THEN** the endpoint responds with HTTP 403

#### Scenario: Admin receives aggregated gang state

- **GIVEN** an admin session and tickets with mixed `slot_count` values
- **WHEN** `GET /api/factory/parallel-status` is called
- **THEN** the endpoint responds with HTTP 200 and a JSON body containing `gangTickets`,
  `slotsClaimed`, `slotsPerBrand`, and `nextTickAt`

### Requirement: Force-Tick Trigger

The system SHALL expose an admin-guarded `POST /api/factory/force-tick` endpoint that records
a force-tick request by writing the `force-tick-requested` control key (ISO timestamp) into
`tickets.factory_control`, so the next factory tick consumes it. The endpoint SHALL be
idempotent — repeated calls only overwrite the timestamp.

#### Scenario: Admin forces the next tick

- **GIVEN** an admin session
- **WHEN** `POST /api/factory/force-tick` is called
- **THEN** the `force-tick-requested` control key is written with the current timestamp and the
  endpoint responds with HTTP 200

#### Scenario: Factory tick consumes and clears the force-tick flag

- **GIVEN** a `force-tick-requested` control key is set
- **WHEN** `scripts/factory/wakeup.sh` starts a tick
- **THEN** it logs that the tick was forced, clears the `force-tick-requested` key, and writes
  `last-tick-at` with the tick completion time

### Requirement: Parallel-Status Panel

The admin dev-status UI SHALL provide a `parallel` tab that fetches `/api/factory/parallel-status`,
renders the gang state, shows a countdown timer toward `nextTickAt` that displays a due state at
zero, and offers a "Force next tick" button that posts to `/api/factory/force-tick` and refetches.

#### Scenario: Panel is deep-linkable

- **GIVEN** the admin pipeline page
- **WHEN** it is opened with `?tab=parallel`
- **THEN** the parallel-status tab is active on load

#### Scenario: Countdown reaches zero

- **GIVEN** the panel is showing a countdown toward `nextTickAt`
- **WHEN** the remaining time reaches zero or below
- **THEN** the panel shows a "tick due" state and refetches the status
