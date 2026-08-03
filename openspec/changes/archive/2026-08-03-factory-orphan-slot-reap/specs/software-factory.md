## ADDED Requirements

### Requirement: Orphaned pipeline slots SHALL be reaped by the watchdog

A ticket that carries a `pipeline_slot` while its status is anything other than
`in_progress` is in an inconsistent state: the slot blocks every future claim
(`slots.sh claim-gang` only updates rows with `pipeline_slot IS NULL`) while
occupying no capacity (`slots.sh count` only sums rows with `status='in_progress'`).

The watchdog SHALL detect this state and release the slot once the ticket has been
untouched for longer than `FACTORY_ORPHAN_SLOT_MIN` (default 10 minutes). The grace
period is deliberately separate from `FACTORY_STALE_MIN` and rules out any race with
an in-flight claim. The watchdog SHALL NOT change the ticket status — an orphaned
slot means the status is already correct and only the slot is wrong.

#### Scenario: Orphaned slot on a backlog ticket is released

- **GIVEN** a ticket with `pipeline_slot=1`, `status='backlog'` and `updated_at` older than `FACTORY_ORPHAN_SLOT_MIN`
- **WHEN** the watchdog runs for that brand
- **THEN** the ticket's `pipeline_slot` is `NULL` and its `status` is still `'backlog'`
- **AND** an audit comment records the release

#### Scenario: Running ticket keeps its slot

- **GIVEN** a ticket with `pipeline_slot=2` and `status='in_progress'`
- **WHEN** the watchdog runs for that brand
- **THEN** the ticket's `pipeline_slot` is still `2`

#### Scenario: Recently touched orphan is left alone

- **GIVEN** a ticket with `pipeline_slot=1`, `status='backlog'` and `updated_at` newer than `FACTORY_ORPHAN_SLOT_MIN`
- **WHEN** the watchdog runs for that brand
- **THEN** the ticket's `pipeline_slot` is still `1`

### Requirement: The watchdog SHALL complete its sweep for every stale ticket

`watchdog.sh` runs under `set -euo pipefail`. Any construct that is invalid at the
script's top level therefore aborts the whole run. Because the stale list is empty
during normal operation, such an abort is invisible until the watchdog is actually
needed.

The watchdog SHALL process every stale ticket to completion — status reset, slot
release, audit comment, worktree cleanup — and SHALL reach the sweeps that follow.

#### Scenario: Sweep survives a stale ticket

- **GIVEN** at least one stale ticket in the brand's queue
- **WHEN** the watchdog runs for that brand
- **THEN** the watchdog exits successfully and emits its JSON array of escalated ids
- **AND** stderr contains no `can only be used in a function` error

### Requirement: A failed slot claim SHALL be reported by the dispatcher

`schedule.sh` currently invokes `slots.sh claim-gang` with `>/dev/null 2>&1`, discarding
both the diagnostic and the exit code, so a candidate that can never be claimed is
skipped on every tick without producing any signal.

The dispatcher SHALL emit a `WARN` line on stderr naming the affected `external_id`
when a slot claim fails. It SHALL remain fail-open: a failed claim skips only that
candidate and never aborts the dispatch run.

#### Scenario: Unclaimable candidate is reported

- **GIVEN** a queued ticket whose slot claim fails
- **WHEN** `schedule.sh` runs for that brand
- **THEN** stderr contains a `WARN` line naming that ticket's `external_id`
- **AND** the emitted launch plan is still valid JSON
- **AND** remaining candidates are still evaluated
