## MODIFIED Requirements

### Requirement: The Software Factory picks up staged task tickets

The Software Factory scheduling pipeline SHALL consume `type='task'` and `type='bug'`
tickets at `status='plan_staged'` in addition to `type='feature'` backlog tickets, so that
a chore plan staged by the `mishap-tracker` and a fix plan staged by `dev-flow-plan` are
both implemented, PR'd, and merged without human intervention. Task and bug tickets SHALL
NOT require the feature-only `lastenheft_locked` readiness flag, because the staged plan is
itself authored and lint-gated by `stage-plan`. Task and bug tickets SHALL share one single
dispatch branch in the `queue.sh` WHERE clause, so that the `execution_released` and
`factory_excluded` readiness gates apply identically to both types and cannot drift apart.
The pipeline SHALL treat `chore/<slug>` work branches as first-class alongside `feature/*`
and `fix/*` for the deploy guard, produce a `chore(...)`-prefixed PR title for them, and
derive the pipeline slug from any `feature|fix|chore` branch prefix.

#### Scenario: queue.sh surfaces a staged task ticket

- **GIVEN** a `type='task', status='plan_staged'` ticket
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket appears in the candidate JSON without needing `lastenheft_locked`

#### Scenario: queue.sh surfaces a staged bug ticket

- **GIVEN** a `type='bug', status='plan_staged'` ticket whose plan was staged by `dev-flow-plan`
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket appears in the candidate JSON without needing `lastenheft_locked`

#### Scenario: the readiness gates hold for staged bug tickets

- **GIVEN** a `type='bug', status='plan_staged'` ticket carrying `readiness.factory_excluded=true`
  (set by `ticket.sh unfactory`) or `readiness.execution_released=false` (set by `stage-plan --hold`)
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket is absent from the candidate JSON, exactly as for a task ticket

#### Scenario: slots.sh claims a slot for a staged task ticket

- **WHEN** `scripts/factory/slots.sh claim <ext_id> <n>` runs for a `plan_staged` task ticket
- **THEN** the claim succeeds and the ticket moves to `status=in_progress`

#### Scenario: pipeline handles a chore branch

- **GIVEN** a work branch `chore/<slug>` auto-detected from the ticket's `FACTORY-PLAN-REF`
- **WHEN** `scripts/factory/pipeline.js` reaches the deploy phase
- **THEN** the branch passes the `^(feature|fix|chore)/` HARD-GUARD and the PR is opened with
  a `chore(<slug>): …` title

#### Scenario: dispatcher-bridge extracts the slug from a chore branch

- **GIVEN** a launch row whose `branch` is `chore/<slug>`
- **WHEN** `scripts/factory/dispatcher-bridge.sh` derives the slug
- **THEN** it yields `<slug>` with no leading `chore/` (no slash leak into the worktree path)
