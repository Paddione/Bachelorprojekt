## MODIFIED Requirements

### Requirement: Unified Merge-equals-Done Closure

The system SHALL close a feature/task ticket directly to `done` with `resolution = 'shipped'` in the same step as a confirmed green auto-merge to `main`, for BOTH drivers — the Factory pipeline (`scripts/factory/pipeline.js`) and dev-flow-execute (`.claude/skills/dev-flow-execute/SKILL.md`), including dev-flow batches that process multiple tickets in parallel. The happy path SHALL NOT write the `awaiting_deploy` or `qa_review` status. Production deploy SHALL remain decoupled (push-based) and SHALL NOT change the ticket status. The `awaiting_deploy` and `qa_review` enum values SHALL remain valid (non-destructive) for historical rows, manual special cases, and the watchdog safety net.

#### Scenario: Factory pipeline closes a ticket on clean merge

- **GIVEN** the Factory Deploy phase confirms a green auto-merge of a PR to `main`
- **WHEN** the Deploy phase records the post-merge status
- **THEN** `decideDeployTransition` returns `{ status: 'done' }`, the pipeline calls `ticket.sh update-status --status done --resolution shipped`, and it does NOT call `update-status --status awaiting_deploy` or `--status qa_review`

#### Scenario: dev-flow-execute closes a ticket on merge

- **GIVEN** dev-flow-execute reaches step 6.5 after a merged PR
- **WHEN** the ticket is closed
- **THEN** the skill calls `update-status --status done --resolution "$RESOLUTION"` (shipped/fixed), NOT `--status qa_review`

#### Scenario: Deploy guard still blocks

- **GIVEN** the Deploy output contains a `BLOCK:` / deploy-guard signal
- **WHEN** `decideDeployTransition` evaluates it
- **THEN** it returns `{ status: 'blocked' }` and the ticket is not closed

#### Scenario: Enum values remain non-destructive

- **GIVEN** the transition layer (`website/src/lib/tickets/transition.ts`) and the DB CHECK constraint
- **WHEN** the status set is inspected
- **THEN** `awaiting_deploy` and `qa_review` are still present (accepted for manual/historical use); no destructive migration removes them

### Requirement: Quality-Gate Outcomes Recorded as Verify Phase-Events

The system SHALL persist quality-gate outcomes as `verify` phase-events in `tickets.factory_phase_events` with a structured `detail` string (`gate=<name> result=<pass|fail> [step=<x>]`) and no new schema object. These events SHALL be fire-and-forget (best-effort, `|| true`) and SHALL NEVER block a merge or a status transition.

#### Scenario: CI pass recorded on close

- **GIVEN** a green CI run precedes a merge in pipeline.js or dev-flow-execute
- **WHEN** the ticket is closed
- **THEN** a `verify`/`done` phase-event is written with `detail` containing `gate=ci result=pass` (best-effort)

#### Scenario: CI failure recorded on block

- **GIVEN** CI is red after the self-healing retries are exhausted in pipeline.js
- **WHEN** the ticket is set to `blocked`
- **THEN** a `verify`/`blocked` phase-event is written with `detail` containing `gate=ci result=fail` (best-effort, non-blocking)

### Requirement: Factory-Floor DAL Hallenbetrieb und Slot-Verwaltung

The system SHALL provide a Data Access Layer (`factory-floor.ts`) that queries active tickets for the factory floor (Hall, Loading Dock, Shipped, Staged, Awaiting Deploy), derives the latest phase and state per ticket from `factory_phase_events`, excludes terminal tickets with stale `pipeline_slot` values from slot counts and Hall display, includes slot-less devflow tickets in the Hall without counting them against slot capacity, and returns provider health status with cooldown classification. The lane row→item mapping SHALL live in a pure helper module `website/src/lib/factory-floor-lanes.ts` (no DB/API import), and the floor payload SHALL expose `awaitingDeployVisible: boolean` so the UI hides the awaiting-deploy lane when it is empty in normal operation.

#### Scenario: Stale Slot-Leak und Devflow-Tickets in der Halle

- **GIVEN** Ticket x1 (archived) hat `pipeline_slot=4` und ist 30 Minuten alt; Ticket dv1 (in_progress) hat `pipeline_slot=NULL` und `driver=devflow`
- **WHEN** `getHall()` und `getControl(3)` aufgerufen werden
- **THEN** x1 wird nicht in der Halle angezeigt und nicht als belegter Slot gezählt (`slotsUsed=2`); dv1 erscheint in der Halle mit `driver=devflow`; mehrere gleichzeitige devflow-Tickets (Batch) erscheinen alle parallel im Hall, da keiner einen Slot belegt

#### Scenario: Awaiting-deploy lane hidden when empty

- **GIVEN** the happy path no longer produces `awaiting_deploy` tickets, so `getAwaitingDeploy()` returns an empty list
- **WHEN** `getFloor()` assembles the payload
- **THEN** `awaitingDeployVisible` is `false`; when at least one ticket is manually held in `awaiting_deploy`, `isAwaitingDeployLaneVisible` returns `true` and the lane renders

#### Scenario: Shipped lane is the unified pipeline end

- **GIVEN** tickets closed via the unified closure (both Factory and devflow) reach `status='done'` with a `kind='pr'` ticket-link
- **WHEN** `getShipped()` is called
- **THEN** those tickets appear in the Shipped lane with their PR number, regardless of driver
