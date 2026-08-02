## ADDED Requirements

### Requirement: The Factory resumes a partially implemented plan instead of replaying it

When the Software Factory picks up a ticket whose plan was staged by a human (`FACTORY-PLAN-REF`
present, REUSE path), the pipeline SHALL skip the plan partials that are already complete. The
authority for completeness SHALL remain the existing `partial-done` entries in
`tickets.factory_phase_events` as evaluated by `read-partials`; no second progress mechanism SHALL
be introduced. The pipeline SHALL log the skipped partial identifiers so the decision is auditable,
and SHALL proceed with the full task list when no partial is complete.

#### Scenario: A branch with two finished partials resumes at the third

- **GIVEN** a `plan_staged` ticket whose plan ships four partials and whose ticket carries
  `partial-done` phase events for `p1` and `p2`
- **WHEN** `scripts/factory/pipeline.js` enters the Plan-Reuse step
- **THEN** the resulting task list contains only `p3` and `p4`, and the skipped identifiers `p1` and
  `p2` are logged

#### Scenario: An untouched staged branch runs the full plan

- **GIVEN** a `plan_staged` ticket with no `partial-done` phase events
- **WHEN** the pipeline enters the Plan-Reuse step
- **THEN** every partial of the plan is scheduled and no partial is reported as skipped

### Requirement: The partial manifest is read after the work tree exists

The pipeline SHALL read the `tasks.d/` partial manifest of a reused plan only once the work tree
for the reuse branch is present, so that a plan shipping partials drives the fan-out directly
instead of falling back to a runtime LLM decompose. When no partial manifest exists, the LLM
decompose SHALL remain the documented fallback, and the pipeline SHALL log that the fallback was
taken so a silent regression to full-replay behaviour is visible in the run output.

#### Scenario: A plan with partials uses them rather than an LLM decompose

- **GIVEN** a reused plan whose change directory contains `tasks.d/` partials
- **WHEN** the pipeline runs the Plan-Reuse step
- **THEN** the partial manifest is read successfully and the task list comes from the partials, with
  no LLM decompose call

#### Scenario: A plan without partials still decomposes

- **GIVEN** a reused plan with no `tasks.d/` directory
- **WHEN** the pipeline runs the Plan-Reuse step
- **THEN** the LLM decompose produces the task list as before, and the run output states that the
  partial manifest was absent

### Requirement: A branch owned by another work tree is deferred, not blocked

When the work branch of a reused plan is already checked out in another work tree, the Factory
SHALL treat this as foreign ownership: it SHALL release its slot and leave the ticket dispatchable
for a later tick, and SHALL NOT set the ticket to `blocked`. The escalation path for a genuinely
failed work-tree creation SHALL remain unchanged.

#### Scenario: A live session holds the branch

- **GIVEN** a `plan_staged` ticket whose branch is checked out in a work tree belonging to a live
  session
- **WHEN** the Factory reaches work-tree setup for that ticket
- **THEN** the ticket keeps its dispatchable status, the slot is released, and no `blocked`
  transition is recorded

#### Scenario: A genuine work-tree failure still escalates

- **GIVEN** work-tree creation fails for a reason other than the branch being checked out elsewhere
- **WHEN** the Factory reaches work-tree setup
- **THEN** the ticket is set to `blocked` and the existing escalation notification is sent

### Requirement: The hold gate remains the default and reclaim remains manual

Resumability SHALL NOT weaken the execution hold introduced for staged plans. `dev-flow-plan` SHALL
continue to stage plans with `readiness.execution_released=false`, and the dispatcher SHALL
continue to require an explicit release before dispatching such a ticket. `ticket.sh reclaim` SHALL
remain a manually invoked escape hatch for derailed executions and SHALL NOT be triggered
automatically by resume detection.

#### Scenario: A held ticket stays untouched despite being resumable

- **GIVEN** a `plan_staged` ticket with `readiness.execution_released=false` and a branch carrying
  partial work
- **WHEN** `scripts/factory/queue.sh` runs
- **THEN** the ticket does not appear among the dispatch candidates

#### Scenario: A released ticket is resumed rather than restarted

- **GIVEN** the same ticket after `ticket.sh release-hold`
- **WHEN** the Factory dispatches it
- **THEN** it appears among the candidates and its already-complete tasks are skipped
