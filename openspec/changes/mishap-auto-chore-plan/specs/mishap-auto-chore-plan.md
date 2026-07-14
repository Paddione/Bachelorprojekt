## ADDED Requirements

### Requirement: Non-critical mishap bundles auto-stage a chore plan

The `mishap-tracker` skill SHALL, immediately after a mishap bundle ticket is created,
decide whether the bundle is critical by inspecting the entry types of its own
`MISHAP_LOG` (the source list it already holds in session). A bundle is critical when at
least one entry has `type` `broken` or `security` — mirroring the `hasCritical`
computation in `scripts/ticket-mcp/go/internal/tools/mishap.go`. For a critical bundle the
skill SHALL leave the ticket untouched (`status=triage`) for manual triage, exactly as
today. For a non-critical bundle (only `degraded`/`suspicious`/`drift`) the skill SHALL
author, lint-gate, and stage a real OpenSpec chore plan, then set the ticket to
`status=plan_staged` on a `chore/<slug>` branch.

The skill SHALL NOT rely on `ticket.sh get` for the criticality decision, because that
command's JSON output does not expose a `severity` field.

#### Scenario: Non-critical bundle is auto-staged

- **GIVEN** a mishap bundle whose entries are all `degraded`, `suspicious`, or `drift`
- **WHEN** the `mishap-tracker` finishes creating the bundle ticket
- **THEN** it runs `openspec.sh propose`, delegates authoring of `tasks.md`, passes
  `plan-lint.sh`, calls `ticket.sh stage-plan --branch chore/<slug>` and commits+pushes the
  branch, leaving the ticket at `status=plan_staged`

#### Scenario: Critical bundle stays manual

- **GIVEN** a mishap bundle with at least one `broken` or `security` entry
- **WHEN** the `mishap-tracker` finishes creating the bundle ticket
- **THEN** no auto-plan flow runs and the ticket remains at `status=triage`

#### Scenario: A failed plan-lint aborts without staging

- **GIVEN** a non-critical bundle whose authored `tasks.md` fails `plan-lint.sh` after the
  bounded retries
- **WHEN** the `mishap-tracker` gives up
- **THEN** it does NOT call `stage-plan`, the ticket remains at `status=triage`, and the run
  reports the lint failure

### Requirement: The Software Factory picks up staged task tickets

The Software Factory scheduling pipeline SHALL consume `type='task'` tickets at
`status='plan_staged'` in addition to `type='feature'` backlog tickets, so that a chore
plan staged by the `mishap-tracker` is implemented, PR'd, and merged without human
intervention. Task tickets SHALL NOT require the feature-only `lastenheft_locked` readiness
flag. The pipeline SHALL treat `chore/<slug>` work branches as first-class alongside
`feature/*` and `fix/*` for the deploy guard, produce a `chore(...)`-prefixed PR title for
them, and derive the pipeline slug from any `feature|fix|chore` branch prefix.

#### Scenario: queue.sh surfaces a staged task ticket

- **GIVEN** a `type='task', status='plan_staged'` ticket
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket appears in the candidate JSON without needing `lastenheft_locked`

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
