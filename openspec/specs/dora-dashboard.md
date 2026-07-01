# dora-dashboard

## Purpose

SSOT spec.

## Requirements

### Requirement: Deployment Frequency Metric

The system SHALL compute Deployment Frequency as the number of merges to `main` per time window — counted as `done` feature/task tickets that have a linked merged PR (`tickets.ticket_links kind='pr'` joined to `tickets.pr_events.merged_at`) — and SHALL surface it together with a per-week rate. The UI SHALL label this metric honestly as "Merges nach main" (not "production deploys"), because production deploy is decoupled (push-based).

#### Scenario: Counts merges and derives a per-week rate

- **GIVEN** two `done` feature tickets each with a merged PR inside the 7-day window
- **WHEN** `computeDora(rows, [], 7, '7d')` runs
- **THEN** `deploymentFrequency.merges` is 2 and `deploymentFrequency.perWeek` is 2

#### Scenario: Empty window yields zero without throwing

- **GIVEN** no merges in the window
- **WHEN** the metric is computed
- **THEN** `deploymentFrequency.merges` is 0 and the dashboard renders an empty state (no crash)

### Requirement: Lead Time for Changes Metric

The system SHALL compute Lead Time for Changes as `merged_at − ticket.created_at` per merged ticket, reporting the **median** as the primary figure and the **mean** as a secondary figure (both in hours), and SHALL preserve the per-stage sub-times (`created→pr_open`, `pr_open→merged`) as drill-down where available.

#### Scenario: Reports both median and mean

- **GIVEN** two merges with lead times of 10h and 20h in the window
- **WHEN** `computeDora` runs
- **THEN** `leadTimeHours.median` is 15 and `leadTimeHours.mean` is 15

#### Scenario: Returns null on an empty window

- **GIVEN** no merges in the window
- **WHEN** the metric is computed
- **THEN** `leadTimeHours.median` and `leadTimeHours.mean` are both `null` (shown as "n/a")

### Requirement: Change Failure Rate Proxy Metric

The system SHALL compute Change Failure Rate as `(# reverted merges + # bug tickets in window) / # merges in window`, deriving reverts from `tickets.pr_events.status = 'reverted'` and bug incidence from `tickets.tickets.type = 'bug'`. The metric SHALL be flagged as an honest **proxy** (`isProxy = true`) because the data model does not blame a specific merge for a bug; the UI SHALL display the "(Proxy)" qualifier. The system SHALL NOT use the existence of a `ticket_links kind='fixes'` link as a failure signal (that link is a self-link / PR-attachment, not a "fixes-a-bug" relation).

#### Scenario: Combines reverts and bug incidence over merges

- **GIVEN** 3 merges, 1 of them reverted, and 1 closed bug in the window
- **WHEN** `computeDora` runs
- **THEN** `changeFailureRate.rate` ≈ 2/3, `changeFailureRate.reverts` is 1, `changeFailureRate.bugs` is 1, and `changeFailureRate.isProxy` is `true`

#### Scenario: Null rate when there are no merges

- **GIVEN** no merges in the window
- **WHEN** the metric is computed
- **THEN** `changeFailureRate.rate` is `null` (shown as "n/a")

### Requirement: MTTR Metric from Bug Tickets

The system SHALL compute Mean Time To Recovery as the **median** of `merged_at(closing PR) − created_at` over `type='bug'` tickets in the window, where the closing PR is resolved via the bug's `ticket_links` PR attachment (`pr_number`) joined to `tickets.pr_events.merged_at`. When there are no closed bugs in the window, the metric SHALL be `null` and displayed as "n/a".

#### Scenario: Median bug recovery time

- **GIVEN** two closed bugs with recovery times of 4h and 8h
- **WHEN** `computeDora([], bugs, 7, '7d')` runs
- **THEN** `mttrHours.median` is 6 and `mttrHours.closedBugs` is 2

#### Scenario: n/a when no closed bugs

- **GIVEN** no closed bug tickets in the window
- **WHEN** the metric is computed
- **THEN** `mttrHours.median` is `null` and `mttrHours.closedBugs` is 0

### Requirement: Consolidated Admin-only DORA Dashboard

The system SHALL expose a consolidated DORA dashboard at `/admin/dora` backed by `GET /api/admin/dora-metrics?window=7d|30d|90d|all`, gated to admins only (`getSession` + `isAdmin`, HTTP 401 for non-admins). The metrics SHALL be unified across BOTH drivers (Factory and dev-flow), counting each ticket once (distinct ticket id), and SHALL additionally expose a driver breakdown (factory vs devflow). The page SHALL be reachable from the AdminLayout navigation (no orphan route).

#### Scenario: Non-admin is rejected

- **GIVEN** an unauthenticated or non-admin caller
- **WHEN** `GET /api/admin/dora-metrics` is called
- **THEN** the response status is 401

#### Scenario: Admin receives all four metrics unified across drivers

- **GIVEN** an authenticated admin and closed tickets from both factory and devflow drivers
- **WHEN** `GET /api/admin/dora-metrics?window=30d` is called
- **THEN** the response includes deployment frequency, lead time, change failure rate, and MTTR, plus a `driverBreakdown` of `{ factory, devflow }`, with `window = '30d'`

#### Scenario: Dashboard renders four metric cards

- **GIVEN** the `/admin/dora` page loads as an admin
- **WHEN** `DoraDashboard.svelte` fetches the metrics
- **THEN** it renders four cards (Deployment Frequency labelled "Merges nach main", Lead Time with median+mean, Change Failure Rate with a "(Proxy)" qualifier, MTTR showing "n/a" when null)

<!-- merged from change delta dora-dashboard.md on 2026-07-01 -->