## MODIFIED Requirements

### Requirement: The ticket lock guard protects the work, not the completion bookkeeping

`_ticket_lock_guard` in `scripts/vda/ticket/_ticket-core.sh` enforces the ticket-scoped
claim in the status write path: a foreign live claim blocks a non-terminal transition
(exit 7). This remains the protection against double-editing (T002282).

For **terminal transitions** (`update-status --status done|archived`) the guard SHALL run in
`closure` mode: a foreign ticket-scoped claim SHALL NOT block the write. The dispatched
subagent, the long-lived `ticket-mcp` server process and the `post-merge` workflow each write
under their own session identity and never hold the session id of the session that claimed the
ticket; blocking the completion would strand the very work the claim was meant to protect. The
guard SHALL emit a warning naming the holder (tool/label/sid) and SHALL point at the regular
release path (`agent-lock.sh release ticket <id>`) so the stale claim can be cleaned up. A
claim held by the calling session's own id SHALL pass through in both modes without a warning.

`scripts/vda/ticket/update-status.sh` SHALL invoke the guard with the `closure` argument
exactly for the terminal statuses `done` and `archived` and without it for every other status.

`scripts/vda/factory-prep.sh` SHALL treat a ticket as claimed by a live interactive session
when either the ticket scope holds it OR a branch-scoped claim exists on a branch carrying the
ticket id as `*-<ext-id>` suffix, so the branch-scoped dispatch convention does not reopen the
double-dispatch race it replaced.

#### Scenario: A foreign ticket lock does not block a terminal transition

- **GIVEN** a live ticket-scoped claim owned by another session id covers `T009901`
- **WHEN** `_ticket_lock_guard T009901 closure` runs
- **THEN** it exits 0 and its diagnostic mentions T003102 and the `release` path

#### Scenario: A foreign ticket lock still blocks a non-terminal transition

- **GIVEN** a live ticket-scoped claim owned by another session id covers `T009902`
- **WHEN** `_ticket_lock_guard T009902` runs (no closure argument)
- **THEN** it exits 7 and refuses the write

#### Scenario: The calling session's own claim passes in both modes

- **GIVEN** a live ticket-scoped claim owned by the calling session's id covers `T009903`
- **WHEN** `_ticket_lock_guard T009903 closure` runs
- **THEN** it exits 0 and emits no warning

#### Scenario: update-status passes the closure flag only for terminal statuses

- **GIVEN** the source of `scripts/vda/ticket/update-status.sh`
- **WHEN** its guard invocation is read
- **THEN** the `done|archived` branch calls `_ticket_lock_guard "$id" closure`
- **AND** every other status branch calls `_ticket_lock_guard "$id"` without the argument

#### Scenario: factory-prep recognises a branch-scoped claim by the ticket id suffix

- **GIVEN** a branch-scoped claim on a branch named `feature/fix-ticket-lock-subagent-T003102`
- **WHEN** `scripts/vda/factory-prep.sh` dispatches for ticket `T003102`
- **THEN** it treats the ticket as claimed by a live interactive session and releases the slot
