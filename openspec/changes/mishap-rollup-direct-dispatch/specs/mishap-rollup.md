## MODIFIED Requirements

### Requirement: rollup-container self-heals on an empty search result

`scripts/ticket.sh rollup-container` SHALL create a new rollup container ticket (Step 2) when its
search for an existing collect-mode container (Step 1) returns an empty result set, instead of
aborting under `set -euo pipefail` before reaching the create path. The search SHALL only match
containers in collect mode: `status IN ('triage','backlog','planning')`, plus a container in
`status='blocked'` when — and only when — it carries no `FACTORY-PLAN-REF` comment. Dispatched
containers (`plan_staged`, `in_progress`, `qa_review`, `awaiting_deploy`) SHALL never be
returned, so that new buffer flushes always target a container whose batch has not yet been
consumed into a plan.

#### Scenario: Empty search result still reaches the create path

- **GIVEN** no ticket matches `type='chore' AND title='Mishap Rollup — fortlaufende Sammlung' AND
  status IN ('triage','backlog','planning')`
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL exit 0, emit the diagnostic
  "kein offener Container, lege neuen an" on stderr, and print the newly created ticket's
  `external_id` on stdout — the search pipeline's `grep -v` returning exit 1 on empty input SHALL
  NOT abort the function under `pipefail`.

#### Scenario: A dispatched container is not reused

- **GIVEN** a rollup container ticket in status `plan_staged` that carries a `FACTORY-PLAN-REF`
  comment
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL NOT print that container's `external_id`
- **AND** it SHALL create a fresh container ticket instead

#### Scenario: A pre-dispatch blocked container is found and reused

- **GIVEN** a rollup container ticket in status `blocked` WITHOUT a `FACTORY-PLAN-REF` comment
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL print that container's `external_id` on stdout
- **AND** it SHALL NOT create a new container ticket

#### Scenario: A blocked container mid-execution is not reused

- **GIVEN** a rollup container ticket in status `blocked` WITH a `FACTORY-PLAN-REF` comment
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL NOT print that container's `external_id`
- **AND** it SHALL create a fresh container ticket instead

### Requirement: Rollup container SHALL be ephemeral

The rollup container ticket SHALL no longer stay open permanently, but it SHALL stay open through
the execution of its plan. The buffer flusher SHALL append to the single collect-mode container
(oldest first). Once the generator has produced the cycle plan from the container's batches, the
generator SHALL stage that plan on the container (`stage-plan --no-hold`) instead of closing it.
The container SHALL close via Merge=Closure (`done`, `resolution=fixed`) when the executor's
implementation PR for the staged plan is merged. At most one collect-mode container SHALL exist
per brand at a time.

#### Scenario: Generator stages the plan instead of closing the container

- **GIVEN** an open rollup container whose batch comments were turned into a generated plan
- **WHEN** the generator finishes publishing the plan branch
- **THEN** the container ticket SHALL be `plan_staged` with the published plan branch recorded
- **AND** the container SHALL NOT be closed by the generator
- **AND** the next flush SHALL create a fresh container

#### Scenario: Container closes when the executor PR merges

- **GIVEN** a rollup container in `plan_staged` whose plan is being executed by the factory
- **WHEN** the executor's implementation PR is merged
- **THEN** the container ticket SHALL be `done` with `resolution=fixed` (Merge=Closure)

### Requirement: Rollup change SHALL merge to main per cycle

The rollup generator SHALL publish each cycle on its own branch (`chore/<cycle-slug>`) with a
plain push — no amend, no force-with-lease. The cycle change SHALL NOT be merged to `main` by a
separate plan PR. Instead, the factory executor SHALL implement the staged plan's tasks as a
normal execution run; the implementation PR SHALL merge the change's file edits to `main`, and
the post-merge finalizer SHALL archive the cycle change under `openspec/changes/archive/`
(including the regenerated `openspec-status.json`), after which the cycle branch and its worktree
SHALL be removed.

#### Scenario: Cycle plan is executed by the factory instead of merged as-is

- **GIVEN** a rollup cycle whose plan has been generated on branch `chore/<cycle-slug>` and staged
  on the container
- **WHEN** the factory executes the staged plan
- **THEN** the executor SHALL implement the plan's tasks and merge the implementation PR
- **AND** the cycle change SHALL be archived under `openspec/changes/archive/` by the
  post-merge finalizer
- **AND** the cycle branch SHALL be deleted afterwards
- **AND** no force-push SHALL have occurred during the cycle

### Requirement: Container description SHALL not claim permanence

The rollup container ticket created by `scripts/ticket.sh rollup-container` SHALL NOT describe
itself as permanently open. Its description SHALL state the ephemeral lifecycle: the container
collects one batch, the generator stages the batch plan on it, and the ticket closes
(`done · resolution=fixed`) when the executor's implementation PR for that plan is merged.

#### Scenario: Fresh container description states the ephemeral lifecycle

- **GIVEN** no collect-mode rollup container exists
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` creates a new container
- **THEN** the ticket description SHALL NOT contain a claim of permanent openness
- **AND** the description SHALL mention that the container closes when its batch plan has been
  executed and merged

## ADDED Requirements

### Requirement: Rollup plan SHALL dispatch via the factory staged lane

The rollup generator SHALL hand the lint-gated cycle plan to the factory dispatcher by staging
it on the container ticket: `ticket.sh stage-plan --id <container> --branch <branch> --plan
<change>/tasks.md --no-hold`. The staged container SHALL satisfy the dispatcher's staged-lane
criteria (`type` not in `project`/`incident`, `status=plan_staged`,
`execution_released=true`) so that `scripts/factory/queue.sh` picks it up on the next tick
without any manual PR step.

#### Scenario: Staged rollup container is dispatchable

- **GIVEN** a rollup container with a published cycle plan
- **WHEN** the generator runs `stage-plan --no-hold` on the container
- **THEN** the container SHALL be `plan_staged` with `execution_released=true`
- **AND** `scripts/factory/queue.sh` SHALL list the container as dispatchable
- **AND** a `FACTORY-PLAN-REF` comment SHALL be present on the container, marking its batch as
  consumed

#### Scenario: plan-lint failure still prevents staging

- **GIVEN** a rollup cycle whose generated `tasks.md` fails `plan-lint`
- **WHEN** the generator runs
- **THEN** the generator SHALL exit non-zero WITHOUT staging the plan
- **AND** the container SHALL remain in collect mode so the next run can process the batch
