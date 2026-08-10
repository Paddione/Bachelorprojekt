## ADDED Requirements

### Requirement: A session's own agent-lock never blocks its own ticket writes

`_ticket_lock_guard` in `scripts/vda/ticket/_ticket-core.sh` SHALL resolve the current session
identity the same way `scripts/agent-lock.sh` records it, including `CLAUDE_CODE_SESSION_ID`,
which takes precedence over `CLAUDE_SESSION_ID`. A successful `agent-lock.sh claim` on a ticket
SHALL therefore never make the same session's subsequent `ticket.sh update-status` fail as
"locked by another session".

#### Scenario: claim followed by update-status succeeds without an override

- **GIVEN** a session that has just claimed ticket `T000001` with exit code 0
- **WHEN** the same session calls `ticket.sh update-status` on that ticket
- **THEN** the call succeeds without `TICKET_LOCK_OVERRIDE=1`

### Requirement: Lock conflicts are detected before work is dispatched

The ticket-ops masterplan procedure SHALL place its lock pre-check **before** the dispatch step,
not after it, and SHALL name LOCK-KONFLIKT as an explicit outcome of that step. A ticket already
claimed by another session is then skipped while planning, instead of surfacing only once the
dispatch attempts its own claim.

#### Scenario: An already-claimed ticket is skipped during planning

- **GIVEN** a ticket claimed by a different live session
- **WHEN** the masterplan procedure runs its pre-check
- **THEN** the ticket is reported as LOCK-KONFLIKT and excluded from the wave

### Requirement: A PR's file scope is checkable against its ticket

`scripts/pr-scope-check.sh` SHALL take a `--ticket` argument, compare the branch's changed files
against that ticket's declared scope, and report out-of-scope files as UNSCOPED. It SHALL offer
`--allow-drift` for the deliberate exception and SHALL exit non-zero with usage when `--ticket`
is missing, so an unparameterised call cannot pass silently.

#### Scenario: Rebase contamination is reported instead of merged unnoticed

- **GIVEN** a branch that carries changes belonging to another ticket
- **WHEN** `pr-scope-check.sh --ticket <id>` runs
- **THEN** those files are listed as UNSCOPED and the check fails

#### Scenario: A call without --ticket is a usage error

- **GIVEN** `pr-scope-check.sh` invoked with no `--ticket`
- **WHEN** it runs
- **THEN** it exits 1 and prints usage, rather than checking nothing and reporting success
