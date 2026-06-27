# fix-awaiting-deploy-visualization-gaps

<!-- merged from change delta fix-awaiting-deploy-visualization-gaps.md on 2026-06-20 -->

## Purpose

### Requirement: awaiting_deploy in all type definitions and labels

The system SHALL include `awaiting_deploy` in `TicketStatus` union types, `VALID_STATUSES`
arrays, `STATUS_LABELS` maps, and `WORKFLOW_STATUSES` lists across `transition.ts`,
`cockpit-labels.ts`, and `admin.ts` so that the status is accepted, displayed, and routed
consistently.

#### Scenario: awaiting_deploy accepted by transition gate

- **GIVEN** the transition API validates a status value
- **WHEN** the status is `awaiting_deploy`
- **THEN** the validation passes (no "invalid status" error)

#### Scenario: awaiting_deploy has a display label

- **GIVEN** `STATUS_LABELS` from `cockpit-labels.ts` is queried
- **WHEN** the key `'awaiting_deploy'` is accessed
- **THEN** the returned string is `'Wartet auf Deploy'`

## Requirements

### Requirement: awaiting_deploy filter chip in CockpitTable

The system SHALL render a filter chip labelled "Wartet auf Deploy" in `CockpitTable` so
that users can filter the ticket list to show only tickets awaiting deployment.

#### Scenario: Filter chip appears in chip bar

- **GIVEN** the CockpitTable is rendered
- **WHEN** the chip bar is shown
- **THEN** a chip with value `awaiting_deploy` and label "Wartet auf Deploy" is present

### Requirement: activeOnly filter counts awaiting_deploy as open work

The system SHALL treat tickets in `awaiting_deploy` status as open (in-progress) work in
the `activeOnly` filter in `CockpitSidebar` so that they are not hidden when the user
enables the active-only view.

#### Scenario: awaiting_deploy tickets visible with activeOnly enabled

- **GIVEN** the cockpit sidebar's activeOnly filter is active
- **WHEN** the product list is derived
- **THEN** features in `awaiting_deploy` state contribute to the `openWork` count and are not hidden

### Requirement: Action buttons in AwaitingDeployLane

The system SHALL render action buttons (Deploy ausführen, PR-Link) inside the
`AwaitingDeployLane` component so operators can act on tickets directly from the pipeline
board.

#### Scenario: Deploy action visible in lane

- **GIVEN** a ticket is in the `AwaitingDeployLane`
- **WHEN** the lane card is rendered
- **THEN** at least one action button is present in the card

### Requirement: Sidebar rollup shows status breakdown

The system SHALL display a per-status count breakdown (done / blocked / inProgress /
awaitingDeploy) in the `CockpitSidebar` rollup so that users can see the portfolio health
at a glance without navigating to the table.

#### Scenario: Breakdown reflects actual ticket distribution

- **GIVEN** the portfolio has 3 done, 1 blocked, 2 in_progress, 2 awaiting_deploy tickets
- **WHEN** the sidebar rollup renders
- **THEN** individual counts for each status category are shown

### Requirement: Watchdog detects awaiting_deploy staleness

The system SHALL check tickets in `awaiting_deploy` status for staleness (>24 h without
update) in the factory watchdog and set `attention_mode = 'needs_human'` when detected.

#### Scenario: Stale awaiting_deploy triggers needs_human

- **GIVEN** a ticket has been in `awaiting_deploy` for more than 24 hours
- **WHEN** the watchdog runs
- **THEN** the ticket's `attention_mode` is updated to `needs_human`

### Requirement: Automated awaiting_deploy to done transition

The system SHALL automatically transition tickets from `awaiting_deploy` to `done` after
a successful deployment (via `feature-promote.sh` or a successful E2E QA ingest) without
requiring manual intervention.

#### Scenario: Successful deploy promotes ticket to done

- **GIVEN** a ticket is in `awaiting_deploy`
- **WHEN** `feature-promote.sh` runs and the deploy succeeds
- **THEN** `ticket.sh update-status --status done` is called for that ticket
