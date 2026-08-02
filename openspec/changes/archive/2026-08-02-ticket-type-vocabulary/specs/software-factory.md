## MODIFIED Requirements

### Requirement: The Software Factory picks up staged task tickets

The Software Factory scheduling pipeline SHALL consume **every** ticket type except `project` at
`status='plan_staged'`, in addition to `type IN ('feature','feat')` backlog tickets, so that a
plan staged by the `mishap-tracker` or by `dev-flow-plan` is implemented, PR'd, and merged without
human intervention. The staged lane SHALL be expressed as an exclusion (`type <> 'project'`)
rather than an enumeration of accepted types, so that adding a type to the vocabulary cannot
render staged tickets of that type invisible to the dispatcher. Staged tickets SHALL NOT require
the feature-only `lastenheft_locked` readiness flag. The pipeline SHALL treat `chore/<slug>` work
branches as first-class alongside `feature/*` and `fix/*` for the deploy guard, produce a
`chore(...)`-prefixed PR title for them, and derive the pipeline slug from any
`feature|fix|chore` branch prefix.

#### Scenario: queue.sh surfaces a staged task ticket

- **GIVEN** a `type='task', status='plan_staged'` ticket
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket appears in the candidate JSON without needing `lastenheft_locked`

#### Scenario: queue.sh surfaces a staged ticket of a newly introduced type

- **GIVEN** staged tickets with `type` in (`chore`, `fix`, `docs`, `refactor`, `perf`, `test`, `ci`, `build`)
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** every one of them appears in the candidate JSON

#### Scenario: Epics are never dispatched

- **GIVEN** a `type='project', status='plan_staged'` ticket
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket does NOT appear in the candidate JSON

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
