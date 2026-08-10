## ADDED Requirements

### Requirement: REQ-SF-HOLD-001 — Queue gate respects an explicit execution-release flag

`scripts/factory/queue.sh` SHALL only select a staged `task` ticket
(`type='task' AND status='plan_staged'`) for autonomous dispatch when
`readiness->>'execution_released'` is either absent (NULL, backward-compatible default
for tickets that never set the flag) or `'true'`. A ticket with
`readiness->>'execution_released' = 'false'` SHALL be excluded from the queue result
until the flag is explicitly flipped back to `true` (`ticket.sh release-hold`).

This closes the residual timing gap from T002267: even with a live, correctly-detected
agent-lock, a ticket is dispatchable from the instant `stage-plan` sets `plan_staged` —
the protection so far depended entirely on the lock being set and still alive at that
exact moment. The flag makes the "hands off, a human is still deciding" state an
explicit, durable ticket property instead of an implicit lock-liveness side effect.

`type='bug'` tickets already fall through `queue.sh`'s `WHERE` entirely (tracked
separately as T002271, `needs_human`) — this requirement does not change that; it only
adds a second, independent gate to the `type='task'` branch.

#### Scenario: A held task ticket is not dispatched even though it is plan_staged

- **GIVEN** a `type='task'` ticket with `status='plan_staged'` and
  `readiness->>'execution_released' = 'false'`
- **WHEN** `scripts/factory/queue.sh` runs for the ticket's brand
- **THEN** the ticket does NOT appear in the returned JSON array

#### Scenario: A staged task ticket without the flag dispatches exactly as before

- **GIVEN** a `type='task'` ticket with `status='plan_staged'` and no `execution_released`
  key in `readiness` (e.g. a mishap-tracker auto-plan that never calls `--hold`)
- **WHEN** `scripts/factory/queue.sh` runs for the ticket's brand
- **THEN** the ticket appears in the returned JSON array — unchanged from pre-T002272
  behavior

#### Scenario: Releasing the hold makes the ticket dispatchable again

- **GIVEN** a ticket held via `readiness->>'execution_released' = 'false'`
- **WHEN** `ticket.sh release-hold --id <ext-id>` is run
- **THEN** `readiness->>'execution_released'` becomes `'true'`
- **AND** the ticket appears in the next `queue.sh` result
