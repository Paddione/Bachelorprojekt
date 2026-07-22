# Spec Delta: parallel-partial-plans → software-factory

## MODIFIED Requirements

### Requirement: Queue-Poll und Slot-Claim

The system SHALL poll the backlog per brand every tick and SHALL account slot
usage as `SUM(slot_count)` over all `in_progress` tickets with a set
`pipeline_slot` (the `pipeline_slot` column remains as the "holds slots" marker).
A single-slot claim (`slot_count=1`, the default) SHALL behave exactly like the
legacy claim. A gang claim (`slots.sh claim-gang <ext_id> <n>`) SHALL be one
atomic SQL statement that succeeds only when
`SUM(slot_count) + n <= FACTORY_SLOTS_PER_BRAND`; on failure it SHALL exit 1 and
claim nothing (all-or-nothing). A claim only succeeds while
`pipeline_slot IS NULL` and `status IN ('backlog','triage','plan_staged')` —
race-safe. `slots.sh release` SHALL reset both `pipeline_slot` to NULL and
`slot_count` to 1. `schedule.sh` SHALL apply head-of-line blocking: if the
front-most queue candidate needs `n` slots and fewer than `n` are free, NO
lower-ranked ticket is pulled ahead in that tick (prevents gang starvation).

#### Scenario: Feature aus dem Backlog schedulen

- **GIVEN** brand `mentolder` has 2 of 3 slots free and ticket T000500 in status `backlog` with `slot_count=1`
- **WHEN** the dispatcher runs `schedule.sh`
- **THEN** T000500 is claimed via `claim-gang` with n=1, receives a `pipeline_slot` and `status=in_progress`; the UPDATE returns the slot number

#### Scenario: Gang claim succeeds when the pool fits

- **GIVEN** brand `mentolder` has 3 of 3 slots free and ticket T000600 staged with `slot_count=3`
- **WHEN** `slots.sh claim-gang T000600 3` runs
- **THEN** the claim succeeds atomically, `SUM(slot_count)` over `in_progress` tickets becomes 3, and T000600 is `in_progress`

#### Scenario: Gang claim is all-or-nothing

- **GIVEN** brand `mentolder` has only 2 of 3 slots free
- **WHEN** `slots.sh claim-gang T000600 3` runs
- **THEN** the command exits 1 and NO row is changed — T000600 keeps `pipeline_slot IS NULL` and its previous status

#### Scenario: Head-of-line blocking prevents gang starvation

- **GIVEN** the front-most queue candidate T000600 needs 3 slots, only 2 are free, and a later candidate T000601 needs 1 slot
- **WHEN** `schedule.sh` runs
- **THEN** the loop breaks at T000600 and T000601 is NOT claimed in this tick

#### Scenario: Release resets the gang accounting

- **GIVEN** ticket T000600 holds a gang claim with `slot_count=3`
- **WHEN** `slots.sh release T000600` runs
- **THEN** `pipeline_slot` becomes NULL and `slot_count` is reset to 1

## ADDED Requirements

### Requirement: Partial-Plan Lifecycle with partial-done Events and Review Rotation

The pipeline SHALL, when a staged change contains a `tasks.d/` directory, read
the partial plans host-side (pipeline-runner command `read-partials`, backed by
`scripts/factory/pipeline-partials.cjs`) and feed them into the generalized
batch path; the runtime `plan:decompose` agent remains the fallback for legacy
plans without partials. Disjointness of the partials' target files SHALL be
re-validated at runtime via `validateDisjoint` from
`scripts/factory/pipeline-decompose.cjs`. Each completed partial SHALL be
recorded as a phase event on `tickets.factory_phase_events` with
`phase='implement'`, `state='partial-done'` and a structured JSON `detail`
(`{partial, files, tests}`). Once ALL `impl` partials have reported
`partial-done`, the review SHALL start as a continuation of the tests-partial
agent (same prompt prefix as its test run for a llama-server prompt-cache hit)
augmented with the diffs of the other partials and an embedding comparison via
factory-mcp `openspec_find_similar`. Slot release and ticket closure stay
unchanged (Merge = Abschluss).

#### Scenario: Partial completion is visible on the factory floor

- **GIVEN** a partial `p1` finished implementing its target files with passing local tests
- **WHEN** the pipeline records the completion
- **THEN** a row appears in `tickets.factory_phase_events` with `phase='implement'`, `state='partial-done'` and a JSON `detail` naming the partial id, its files, and the test result

#### Scenario: Review rotation waits for all impl partials

- **GIVEN** a 3-partial gang where `p1` reported `partial-done` but `p2` has not
- **WHEN** the pipeline evaluates `rotationReady`
- **THEN** the review does NOT start; it starts only after `p2` also reports `partial-done`, and then runs as the continuation of the `p3` tests agent

#### Scenario: Legacy plan without partials uses the decompose fallback

- **GIVEN** a staged plan whose change directory has no `tasks.d/`
- **WHEN** the pipeline runs `read-partials`
- **THEN** the runner reports `partials: false` and the pipeline falls back to the runtime `plan:decompose` path unchanged

### Requirement: Bonsai Provider Registration for Implement and Review

The system SHALL provide an idempotent registration script
(`scripts/factory/provider-register-bonsai.sh`) that registers the local Bonsai
llama.cpp server (`llamacpp`, model `ternary-bonsai-27b`, base URL
`http://127.0.0.1:8093/v1`, `max_concurrent=3`) in `tickets.provider_config`
via `ON CONFLICT (source, tier, priority) DO UPDATE` and pins
`tickets.factory_model_slots` for `phase='implement'` and `phase='verify'` via
`ON CONFLICT (phase) DO UPDATE`, for both brands. Scout and Plan phases keep
their existing routing. The server-side slot budget convention is `-np 4` = 3
factory workers + 1 orchestrator; the factory DB pool stays at 3.

#### Scenario: Registration is idempotent

- **GIVEN** the registration script already ran once
- **WHEN** it runs a second time
- **THEN** it exits 0 and the end state is identical — no duplicate rows in `provider_config` or `factory_model_slots`

#### Scenario: Implement and review phases route to Bonsai

- **GIVEN** the registration script has run
- **WHEN** `route-provider.sh factory-implement sonnet` or the review path resolves a provider
- **THEN** the phase-pinned `factory_model_slots` row wins and returns `llamacpp` with base URL `http://127.0.0.1:8093/v1`

### Requirement: PR Creation Gate after Local Verify and Completed Review

The pipeline SHALL create a pull request only after (a) `task test:all && task
freshness:check` passed locally on the work branch AND (b) the rotated
p3-review completed. This authorization SHALL be signalled as a phase event on
`tickets.factory_phase_events` with `phase='verify'` and `state='pr-ready'`
(structured JSON `detail`). Before that event exists, the Deploy phase SHALL
only push the branch (no `gh pr create`, no auto-merge queue) and end with
status `pending-pr-gate`. The gate check runs host-side (pipeline-runner
command `pr-gate`, helper `prGateSatisfied` in
`scripts/factory/pipeline-partials.cjs`).

#### Scenario: No PR without the pr-ready event

- **GIVEN** a ticket whose local verify has not yet passed and whose review is still running
- **WHEN** the Deploy phase evaluates the `pr-gate` command
- **THEN** it receives `pr_ready: false`, pushes only the branch, creates no PR, and returns `pending-pr-gate`

#### Scenario: pr-ready authorizes the PR

- **GIVEN** `task test:all && task freshness:check` passed locally and the rotated p3-review finished
- **WHEN** the pipeline emits the `verify`/`pr-ready` phase event and the Deploy phase re-evaluates the gate
- **THEN** the PR is created and auto-merge is queued (`gh pr merge --squash --auto`)

### Requirement: Ticket-scoped CI Babysit Loop for the Own PR

After PR creation and auto-merge queueing, the orchestrator SHALL babysit the
CI checks of its OWN PR via `scripts/factory/pr-babysit-ticket.sh <ticket_id>
<pr_number>` (GitHub CLI via `gh-axi`, polling cadence per the ci-fix-loop
reference). On a failing check it SHALL dispatch a fix subagent with the check
name, a failure-log excerpt, and the affected files, wait synchronously for
its return, and then RE-CHECK ALL checks: any check that turned red in the
meantime SHALL be fixed first. Auto-merge SHALL only be re-queued when no
known-red check remains (green or pending are acceptable). Failure
classification SHALL be reused from `scripts/factory/classify-failure.sh`
(`classify_failure <ci-log-file>`); the loop complements the repo-wide
`scripts/factory/babysit-prs.sh` scanner and does not replace it. After
`MAX_CI_ATTEMPTS` (default 5) the loop SHALL exit non-zero and escalate via
the existing blocked path.

#### Scenario: Red check is fixed and merge is re-queued

- **GIVEN** the own PR has one failing required check and auto-merge is queued
- **WHEN** the babysit loop detects the failure
- **THEN** it dispatches a fix subagent with check name, log excerpt, and affected files, waits for its return, re-checks all checks, and re-queues auto-merge once everything is green or pending

#### Scenario: A second check turns red before requeue

- **GIVEN** the fix subagent for the first red check returned successfully
- **WHEN** the re-check finds that another check has turned red in the meantime
- **THEN** the loop fixes the newly red check first and does NOT re-queue auto-merge until no known-red check remains

#### Scenario: Attempt limit escalates instead of looping forever

- **GIVEN** the loop reached `MAX_CI_ATTEMPTS` with checks still red
- **WHEN** the limit is evaluated
- **THEN** the script exits non-zero with the list of red checks and the pipeline escalates via the existing blocked path (`update-status --status blocked` + notification)
