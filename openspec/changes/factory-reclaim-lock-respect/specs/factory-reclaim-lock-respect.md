## ADDED Requirements

### Requirement: The dispatcher skips tickets held by a live interactive session

`scripts/factory/dispatcher.js` SHALL consult `scripts/agent-lock.sh check ticket <id>` for
every candidate ticket before claiming a slot, and SHALL skip any ticket for which the check
reports `held` (exit 3). Tickets reporting `free` or `mine` (exit 0) are dispatched as
before. Skipped tickets SHALL be logged so a skip is never silent.

The previous sentinel — a regex on the `interactive-worker` label that reduced `maxParallel`
by one — SHALL be removed. It was ticket-independent and never matched the labels the
dev-flow skills actually use.

A stale lock SHALL NOT block dispatch: `agent-lock.sh check` reports `free` for a reapable
lock, so an abandoned session cannot starve the queue.

#### Scenario: A ticket claimed by a live session is left alone

- **GIVEN** ticket `T000123` is `plan_staged` and a live session holds a ticket-scoped
  agent-lock on it
- **WHEN** the factory dispatcher ticks
- **THEN** no slot is claimed for `T000123`, its status stays `plan_staged`, and the skip is
  logged

#### Scenario: An unclaimed staged ticket is still dispatched

- **GIVEN** ticket `T000124` is `plan_staged` with no agent-lock
- **WHEN** the factory dispatcher ticks
- **THEN** it is claimed and moved to `in_progress` as before

#### Scenario: A dead lock does not starve the queue

- **GIVEN** ticket `T000125` is `plan_staged` and its agent-lock belongs to a session that no
  longer exists
- **WHEN** the factory dispatcher ticks
- **THEN** `agent-lock.sh check` reports `free` and the ticket is dispatched normally

#### Scenario: Staged tickets remain visible in the queue

- **GIVEN** a `plan_staged` ticket held by a live session
- **WHEN** the factory queue is listed
- **THEN** the ticket still appears — holding it suppresses dispatch, not visibility

### Requirement: A staged ticket can be reclaimed for interactive work

`scripts/ticket.sh reclaim <id>` SHALL hand a ticket back to the calling session in one step:
release its pipeline slot, set its status to `plan_staged`, and place a ticket-scoped
agent-lock for the caller. The status SHALL NOT be set to `blocked` — the plan is complete
and nothing is blocking it; `blocked` would misreport the ticket's state.

Worker liveness SHALL be determined from `updated_at` using the same staleness semantics as
`scripts/factory/watchdog.sh`. The implementation SHALL live in `scripts/ticket-reclaim.sh`,
dispatched from `ticket.sh`.

#### Scenario: Reclaiming a ticket with no active worker

- **GIVEN** ticket `T000126` is `in_progress` with `pipeline_slot=1` and no phase progress
  beyond the staleness threshold
- **WHEN** `ticket.sh reclaim T000126` runs
- **THEN** the slot is released, the status becomes `plan_staged`, and the caller holds a
  ticket-scoped agent-lock

#### Scenario: Reclaiming is refused while a worker is alive

- **GIVEN** ticket `T000127` is `in_progress` with a slot and recent phase progress
- **WHEN** `ticket.sh reclaim T000127` runs without `--force`
- **THEN** it exits non-zero, changes nothing, and reports the slot, the status and the age
  of the last progress

#### Scenario: --force takes over from a live worker

- **GIVEN** the same ticket `T000127` with a live worker
- **WHEN** `ticket.sh reclaim T000127 --force` runs
- **THEN** the slot is released, the status becomes `plan_staged`, and the caller holds the
  lock

#### Scenario: A reclaimed ticket is not re-dispatched

- **GIVEN** ticket `T000126` was reclaimed and the caller's session is alive
- **WHEN** the factory dispatcher ticks
- **THEN** the ticket is skipped because its agent-lock reports `held`
