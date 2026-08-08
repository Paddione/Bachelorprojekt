## ADDED Requirements

### Requirement: SDLC ticket data is held primarily by the local database

The `tickets` schema SHALL reside in the local PostgreSQL of the `mentolder-dev` cluster and
be the authoritative store for all SDLC data. The table `tickets.provider_config` is exempt and
SHALL remain on fleet, because `coaching.sessions.ki_config_id` references it and coaching is
production data under ADR-006. The local stack SHALL maintain its own `provider_config` with the
same structure and independent content.

#### Scenario: Ticket operations reach the local database by default

- **GIVEN** no `TICKET_CTX` is set in the environment
- **WHEN** any ticket command is invoked
- **THEN** it addresses the local cluster, not fleet

#### Scenario: Row counts match after migration

- **GIVEN** the migration has completed
- **WHEN** row counts per table are compared between the local database and the fleet copy
- **THEN** they are equal for every table except `provider_config`

#### Scenario: A factory tick completes without the production database

- **GIVEN** the WireGuard mesh to fleet is down
- **WHEN** a full factory tick runs
- **THEN** it completes successfully without reaching the fleet database

---

### Requirement: The fleet copy is frozen against writes after cutover

After cutover the fleet `tickets` schema SHALL reject `INSERT`, `UPDATE` and `DELETE` from the
`website` role, so that a stale `TICKET_CTX=fleet` fails loudly instead of diverging silently.
`SELECT` SHALL remain permitted so the history stays readable. `provider_config` is exempt and
SHALL stay writable for coaching.

#### Scenario: Writing to the frozen copy fails

- **GIVEN** the cutover has completed
- **WHEN** a write is attempted against `tickets.tickets` on fleet
- **THEN** the statement fails with a permission error

#### Scenario: Reading the frozen copy still works

- **GIVEN** the cutover has completed
- **WHEN** a `SELECT` is issued against `tickets.tickets` on fleet
- **THEN** it returns the archived rows

#### Scenario: Coaching keeps writing its provider configuration

- **GIVEN** the cutover has completed
- **WHEN** coaching updates a row in `tickets.provider_config` on fleet
- **THEN** the write succeeds

---

### Requirement: A local poller carries GitHub state into the local database

Because GitHub cannot reach the Dev-Host, a local poller SHALL fetch merged pull requests,
pull request state and check runs from the GitHub API and write them into the local database.
It SHALL advance its cursor only after the local write has succeeded, and every write SHALL be
idempotent so at-least-once delivery cannot produce duplicates.

#### Scenario: A merge closes its ticket without CI writing to the database

- **GIVEN** the poller is running and a pull request carrying a ticket reference is merged
- **WHEN** the next poll cycle runs
- **THEN** the referenced ticket is closed in the local database, without any CI job writing to it

#### Scenario: Events survive a workstation outage

- **GIVEN** the poller is stopped and a pull request is merged in the meantime
- **WHEN** the poller is started again
- **THEN** the merge is processed and the ticket is closed

#### Scenario: Reprocessing the same event changes nothing

- **GIVEN** an event has already been processed
- **WHEN** the same event is polled a second time
- **THEN** the local state is unchanged and no duplicate row is created

---

### Requirement: Customer bug reports reach the local database through an outbox

The production website SHALL write customer bug reports into `public.bug_report_outbox` on
fleet instead of creating a ticket directly, following the retry semantics of
`public.systemtest_failure_outbox`. The poller SHALL consume that outbox, create the ticket
locally and mark the row as processed.

#### Scenario: A bug report becomes a local ticket

- **GIVEN** a customer submits a bug report on the production website
- **WHEN** the poller runs its next cycle
- **THEN** a ticket exists in the local database and the outbox row is marked processed

#### Scenario: An unprocessable row does not block the queue

- **GIVEN** one outbox row cannot be processed
- **WHEN** the poller runs
- **THEN** that row keeps its error text and retry timestamp, and the remaining rows are still processed

---

### Requirement: The local database is backed up off the workstation

The local SDLC database SHALL be dumped on a daily schedule and stored on fleet, so that a loss
of the workstation does not destroy data that is part of the thesis. The restore path SHALL be
verified, not assumed.

#### Scenario: A backup is produced daily

- **GIVEN** the backup timer is active
- **WHEN** a day has passed
- **THEN** a dump of the local `tickets` schema is present on fleet

#### Scenario: The backup restores into a usable database

- **GIVEN** a stored dump
- **WHEN** it is restored into an empty throwaway database
- **THEN** the row counts per table match the source at dump time
