## ADDED Requirements

### Requirement: Daemon Runtime Contract

The cockpit daemon SHALL be startable from a clean checkout without manual dependency
installation. Every package imported by `.lavish/kit/daemon/` SHALL be declared in a
`package.json` tracked in the repository, and the daemon SHALL be covered by the
TypeScript project references so that the repository typecheck includes it.

#### Scenario: Starting the daemon from a clean checkout

- **GIVEN** a checkout in which only the repository's declared dependencies are installed
- **WHEN** the operator starts the cockpit daemon
- **THEN** the daemon listens on its configured port
- **AND** `GET /health` answers with HTTP 200

#### Scenario: Dependency is declared, not merely installed

- **GIVEN** the repository's `package.json`
- **WHEN** the daemon's imports are resolved
- **THEN** `hono` and `@hono/node-server` are both declared as dependencies
- **AND** the module resolver finds them at runtime

#### Scenario: Typecheck covers the daemon sources

- **GIVEN** a type error introduced in `.lavish/kit/daemon/`
- **WHEN** the repository typecheck runs
- **THEN** the typecheck reports that error instead of passing

### Requirement: Documented Start Path

The repository SHALL provide a single documented command that starts the cockpit daemon,
waits until it is answering, and reports failure loudly. The command SHALL NOT exit
successfully while the daemon is unreachable.

#### Scenario: Start command waits for readiness

- **GIVEN** the daemon is not running
- **WHEN** the operator runs the documented start command
- **THEN** the command returns only after `GET /health` answers
- **AND** the command exits non-zero if the daemon never becomes reachable

### Requirement: Daemon Test Gate Is Fail-Closed In CI

The daemon-dependent tests of the sdlc-cockpit suite SHALL NOT be silently skipped in CI.
When the environment declares that a daemon is required, an unreachable daemon SHALL fail
the test run. Outside that environment, skipping remains the intended behaviour so the
static tests can be run without a daemon.

#### Scenario: Unreachable daemon fails the run when a daemon is required

- **GIVEN** the environment declares that the daemon is required
- **AND** no daemon is listening on the configured port
- **WHEN** the sdlc-cockpit suite runs
- **THEN** the run reports a failure
- **AND** the output contains no skipped tests

#### Scenario: Skipping stays available for local runs

- **GIVEN** the environment does not declare that the daemon is required
- **AND** no daemon is listening on the configured port
- **WHEN** the sdlc-cockpit suite runs
- **THEN** the daemon-dependent tests are skipped
- **AND** the run succeeds

#### Scenario: CI declares the requirement and starts the daemon

- **GIVEN** the CI workflow that executes the spec suite
- **WHEN** that workflow definition is inspected
- **THEN** it starts the cockpit daemon before the suite
- **AND** it declares the daemon as required

### Requirement: Health Endpoint Carries A Fetch Timestamp

Every daemon response that the cockpit renders SHALL carry the timestamp of the data it
reports, including the health endpoint. A consumer SHALL be able to tell how old the
information is without inferring it from the request time.

#### Scenario: Health response is timestamped

- **GIVEN** a running daemon
- **WHEN** `GET /health` is requested
- **THEN** the response carries an ISO 8601 fetch timestamp
