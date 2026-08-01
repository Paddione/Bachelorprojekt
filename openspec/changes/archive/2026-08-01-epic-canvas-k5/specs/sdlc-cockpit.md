# Delta Spec: K5 — Epic-Canvas und Planungs-Workflow

> Parent SSOT: `sdlc-cockpit`
> Änderungstyp: ADDED (K5 ergänzt den Epic-Canvas und seine Datenquellen)

## ADDED Requirements

### Requirement: Epic-Liste als Daemon-Route (E6)

The system SHALL expose die laufenden Epics über die Daemon-Route
`GET /api/cockpit/epics`. The response SHALL carry a `fetchedAt` field (D12) and
SHALL contain either an `epics` list OR an `error` field — an empty list MUST NOT
mask a failure (D13). Browser access SHALL go exclusively through the adapter
method `data.epics()`; no panel calls `fetch()` directly (E1).

#### Scenario: The route is registered and responds

- **GIVEN** the daemon is running
- **WHEN** `GET /api/cockpit/epics` is called
- **THEN** it responds with HTTP 200
- **AND** the response contains `fetchedAt`

#### Scenario: A failure is named, not disguised as an empty list

- **GIVEN** the ticket source is unreachable
- **WHEN** `GET /api/cockpit/epics` is called
- **THEN** the response contains an `error` field
- **AND** a genuinely empty result set remains distinguishable from it

#### Scenario: No panel bypasses the adapter

- **GIVEN** a panel needs the epic list
- **WHEN** its source is checked for direct `fetch()` calls
- **THEN** it contains none
- **AND** access goes through `data.epics()`

### Requirement: Detection of foreign changes before export (OF1)

The system SHALL determine, before each canvas export, whether
`openspec/changes/` has been modified by others since the last export, and SHALL
offer this check via `GET /api/cockpit/epics/:id/changes-since`. Where no
reliable statement is possible — missing or unusable reference timestamp,
unreadable source — the response SHALL be `hasChanges: true`. The conservative
answer is binding because a `false` would, in the least certain case, advise
overwriting someone else's progress.

#### Scenario: Without a reference point, "possibly changed" applies

- **GIVEN** no or an unusable `ts` parameter
- **WHEN** `changes-since` is called
- **THEN** the response is `hasChanges: true`

#### Scenario: A timestamp is validated before it is used

- **GIVEN** a `ts` parameter that is not an ISO timestamp
- **WHEN** `changes-since` is called
- **THEN** it is rejected instead of being passed to the underlying command

### Requirement: The canvas export does not write server-side

The system SHALL perform the canvas export as a client-side operation. The
canvas SHALL NOT write to `openspec/changes/` through a daemon route while the
authentication design from K4 is outstanding. Only those artifact parts the
canvas itself authored are exported — `proposal.md` and `tasks.md` remain
untouched. This preserves the ownership boundary from OF1: "the canvas is the
source" means "the source for the parts it writes".

#### Scenario: No server-side write path

- **GIVEN** a user triggers the export
- **WHEN** the operation runs
- **THEN** the output is produced in the browser
- **AND** no writing daemon route is called

### Requirement: The daemon identifies its checkout to tests

The system SHALL report, in the response to `GET /health`, the checkout the
daemon was started from. Tests SHALL use this to determine whether the
responding daemon carries the code under test; otherwise the run SHALL be
skipped (locally) or fail (under `COCKPIT_DAEMON_REQUIRED`). Without this field a
daemon from a foreign working directory is indistinguishable from the correct
one — the suite then measures the wrong state and still reports a result.

#### Scenario: /health names the checkout

- **GIVEN** a running daemon
- **WHEN** `GET /health` is called
- **THEN** the response contains the field `root`

#### Scenario: A daemon from a foreign checkout is detected

- **GIVEN** a daemon from another working directory answers on the port
- **WHEN** the test precondition is evaluated
- **THEN** the test is skipped or fails
- **AND** the message names both the found and the expected checkout
