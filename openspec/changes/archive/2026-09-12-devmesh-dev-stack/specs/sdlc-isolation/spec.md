## RENAMED Requirements

### Requirement: SDLC data is local-primary, CI events arrive via pull

**Renamed-to:** Ticket data is primary on fleet, CI events arrive via pull

## MODIFIED Requirements

### Requirement: Ticket data is primary on fleet, CI events arrive via pull

The `tickets` schema SHALL be primary on the `fleet` shared-db (namespace `workspace`, database
`website`). The devmesh development instance SHALL hold development data only and SHALL NOT be
written by the ticket tooling. CI events (runs, PRs, checks) SHALL be fetched from GitHub by a
poller (pull model); GitHub SHALL NOT reach into the home network.

#### Scenario: A factory tick writes to the fleet database

- **GIVEN** the fleet shared-db is primary for `tickets.*`
- **WHEN** a factory tick records a phase event
- **THEN** the event is written to the fleet database and not to the devmesh database

#### Scenario: CI events are polled, not pushed

- **GIVEN** a CI run finishes on GitHub
- **WHEN** the poller runs
- **THEN** the run, its PR and its checks are fetched via the GitHub API and written into the
  primary database; no inbound connection from GitHub into the home network exists

### Requirement: Local PostgreSQL bootstraps the tickets schema

The PostgreSQL of the devmesh development instance SHALL host the `website` database whose
`tickets` schema bootstraps itself on first use (idempotent schema init). Its contents are
development data migrated from `k3d-mentolder-dev` or created during development; they SHALL NOT
be treated as ticket data of record.

#### Scenario: Tickets schema exists after first console request

- **GIVEN** a fresh devmesh PostgreSQL and a running console
- **WHEN** the console serves a schema-touching request
- **THEN** the `tickets` schema with its tables exists in the devmesh `website` database
  (verified via `information_schema`)

### Requirement: Local authentication with fail-closed fallback over the mesh

The SDLC console of the devmesh development instance SHALL authenticate against the devmesh
Pocket ID by default. When that instance is unreachable, the console SHALL fall back to the
fleet Pocket ID through its public host. When neither provider is available, access SHALL be
denied — a dedicated test SHALL prove that an auth failure denies access instead of granting a
degraded session.

#### Scenario: devmesh Pocket ID authenticates without fleet

- **GIVEN** the devmesh Pocket ID is running and the fleet Pocket ID is unreachable
- **WHEN** a user signs in to the SDLC console
- **THEN** authentication succeeds through the devmesh Pocket ID

#### Scenario: Unreachable devmesh Pocket ID falls back to fleet

- **GIVEN** the devmesh Pocket ID is unreachable and the fleet Pocket ID is reachable
- **WHEN** a user signs in to the SDLC console
- **THEN** authentication succeeds through the fleet Pocket ID

#### Scenario: Auth failure denies access (fail-closed)

- **GIVEN** neither the devmesh nor the fleet Pocket ID is available
- **WHEN** a user attempts to sign in
- **THEN** access is denied and no degraded-but-open session is created; the dedicated
  fail-closed test passes
