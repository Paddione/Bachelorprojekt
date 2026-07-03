## ADDED Requirements

### Requirement: Agent-lock reap age is measured against heartbeat_at, not created_at alone

The `scripts/agent-lock.sh` `_reapable()` function SHALL compute the age reference used by the
`pid-dead` and `sid-dead` reap branches from `heartbeat_at` when present, falling back to
`created_at` only when `heartbeat_at` is absent (legacy claim files predating that field). A
claim whose `heartbeat_at` was refreshed recently SHALL NOT be reaped by the `pid-dead` or
`sid-dead` branches purely because its `created_at` is old. The `heartbeat-ttl` branch remains
the ultimate fallback for genuinely stale, never-refreshed claims and is unaffected.

#### Scenario: A recently-refreshed claim survives the pid-dead reap despite an old created_at

- **GIVEN** a lock file with `created_at` far older than `AGENT_LOCK_GRACE` seconds, but
  `heartbeat_at` set to the current time (a recent refresh), and a dead `owner_pid`
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the claim is NOT reaped and still appears in `agent-lock.sh list`

#### Scenario: A claim whose heartbeat is also stale is still reaped

- **GIVEN** a lock file with both `created_at` and `heartbeat_at` far older than
  `AGENT_LOCK_GRACE` seconds, and a dead `owner_pid`
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the claim is reaped with reason `pid-dead` (or `sid-dead`, depending on which check
  fires first) and no longer appears in `agent-lock.sh list`

### Requirement: ticket create validates --severity client-side before any DB access

`scripts/vda/ticket/create.sh` SHALL validate a non-empty `--severity` value against the enum
`critical|major|minor|trivial` before making any database call (`_pgpod`/`_exec_sql`). An invalid
value SHALL cause the script to exit with status `2` and a stderr message listing all four
allowed values, without ever burning a ticket sequence id. An empty/omitted `--severity` remains
allowed and skips the guard entirely. `scripts/ticket.sh`'s usage text SHALL document the four
allowed values.

#### Scenario: An invalid --severity value is rejected before any DB access

- **GIVEN** `create.sh create --type bug --title "x" --description "y" --severity hoch` is
  invoked with `kubectl` unreachable (no cluster access possible)
- **WHEN** the script runs
- **THEN** it exits with status `2` and stderr lists `critical`, `major`, `minor`, and `trivial`

#### Scenario: An empty --severity is still allowed

- **GIVEN** `create.sh create --type bug --title "x" --description "y"` is invoked without a
  `--severity` flag
- **WHEN** the script runs
- **THEN** the severity validation guard does not trigger (the script proceeds to the DB step)

### Requirement: Offline-guard helpers are reachable from every ticket CLI script that needs them

`_ticket_offline_skip` and `_ticket_offline_refuse_read` SHALL be defined in the shared
`scripts/vda/ticket/_ticket-core.sh`, which every `scripts/vda/ticket/*.sh` subcommand script and
`scripts/ticket.sh` source. `scripts/ticket.sh` SHALL NOT redefine these functions locally.

#### Scenario: get.sh no longer emits a command-not-found error for the offline guard

- **GIVEN** `scripts/vda/ticket/get.sh --id T000001` is invoked (offline or online)
- **WHEN** the script reaches its `_ticket_offline_refuse_read` call
- **THEN** stderr does NOT contain `command not found`

#### Scenario: _ticket_offline_refuse_read is defined in the shared core

- **GIVEN** `scripts/vda/ticket/_ticket-core.sh`
- **WHEN** the file is inspected
- **THEN** it contains a `_ticket_offline_refuse_read()` function definition
