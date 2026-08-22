## ADDED Requirements

### Requirement: REQ-HEALTH-GOALS-011 — On-demand rescan is read-only against the SSOT

The SDLC health dashboard SHALL offer an on-demand rescan of selected goals that runs the existing
measurement (`scripts/health-goals-check.sh --only=<IDs>` with `HG_VALUES_FILE` set) and returns the
freshly measured values to the browser. That rescan SHALL NOT write `.claude/lib/goals.md` and SHALL
NOT regenerate `components/website/src/lib/sdlc/goals-data.generated.json`.

`.claude/lib/goals.md` remains the sole authored source of truth (REQ-HEALTH-GOALS-001) and the
scheduled workflow remains the only writer of documented values (REQ-HEALTH-GOALS-008/009). A write
path from the dashboard would race that workflow over the same file and would break the freshness
invariant of REQ-HEALTH-GOALS-003 inside unrelated pull requests.

The dashboard SHALL display a rescanned value alongside the documented one, marking a divergence
rather than replacing the documented value in place.

#### Scenario: A rescan leaves the authored SSOT byte-identical

- **GIVEN** a checkout in which `.claude/lib/goals.md` and
  `components/website/src/lib/sdlc/goals-data.generated.json` are committed and unmodified
- **WHEN** the rescan path is executed for one or more goal IDs
- **THEN** both files remain byte-identical to their committed content
- **AND** the measured values are returned to the caller instead of being persisted

#### Scenario: The dashboard shows documented and freshly measured value side by side

- **GIVEN** a goal whose documented `current` is `5` and whose rescan measures `3`
- **WHEN** the rescan result is rendered
- **THEN** the card shows both values and marks the divergence
- **AND** the documented value is still identifiable as the documented one

### Requirement: REQ-HEALTH-GOALS-012 — An unmeasurable goal reports "nicht messbar", never a value

When `scripts/health-goals-check.sh` cannot measure a goal it returns the sentinel `-`, `row()`
counts it as `SKIP` and writes **no** line to `HG_VALUES_FILE`. The rescan result for such a goal
SHALL be an explicit "not measurable" outcome — never the previously documented value, never an
empty cell, and never a success value.

An absent line in `HG_VALUES_FILE` is the only signal that the measurement did not run. Rendering
it as anything other than an explicit failure recreates the silent-failure class of T002583/T002648,
where a measurement that never ran looked like a result.

#### Scenario: A requested goal that produced no values line is reported as unmeasurable

- **GIVEN** a rescan requested for goal IDs `G-A` and `G-B`
- **AND** an `HG_VALUES_FILE` that contains a line for `G-A` only
- **WHEN** the rescan result is assembled
- **THEN** the result contains an entry for `G-B` flagged as not measurable
- **AND** that entry carries no numeric value

#### Scenario: A goal ID the measurement never emitted is not silently dropped

- **GIVEN** a rescan requested for a goal ID that `health-goals-check.sh` does not cover
- **WHEN** the rescan result is assembled
- **THEN** the response still contains an entry for that ID, flagged as not measurable

### Requirement: REQ-HEALTH-GOALS-013 — Rescan input is validated against the known goal set

Goal IDs arriving from the browser SHALL be accepted only when they appear in the generated goal
artifact (`components/website/src/lib/sdlc/goals-data.generated.json`). Unknown IDs SHALL be
rejected. The measurement SHALL be invoked with an argument array (no shell interpolation), and the
route SHALL require an authenticated admin session.

A character whitelist alone is insufficient: a well-formed but unknown ID would be passed through to
the `--only=` argument of a spawned script. Validating against the known set makes the accepted
input finite and enumerable.

#### Scenario: An unknown goal ID is rejected

- **GIVEN** a rescan request containing an ID that is absent from the generated goal artifact
- **WHEN** the request is validated
- **THEN** it is rejected with a client error and no measurement is spawned

#### Scenario: An unauthenticated request reaches no measurement

- **GIVEN** a rescan request without an admin session
- **WHEN** the route handles it
- **THEN** it responds `401` and no measurement is spawned

### Requirement: REQ-HEALTH-GOALS-014 — Marked goals become one deduplicated ticket each

The dashboard SHALL offer creating improvement tickets for the marked goals: one ticket per goal,
carrying the goal ID, the documented current and target value, the direction, the measurement
command and the source. Before creating a ticket the system SHALL check for an existing ticket whose
title starts with the goal's stable title prefix and whose status is not `done`, `archived` or
`wont-fix`; when such a ticket exists the goal SHALL be reported as skipped instead of producing a
duplicate.

Creating tickets SHALL NOT enqueue them into the Factory queue — dispatch stays an explicit operator
decision.

#### Scenario: A goal with an open ticket is skipped, not duplicated

- **GIVEN** a goal `G-X` for which an open ticket titled with the `G-X` prefix already exists
- **WHEN** ticket creation runs for `G-X`
- **THEN** no second ticket is created
- **AND** `G-X` is reported as skipped with the existing ticket identified

#### Scenario: A created ticket carries the goal's measurement provenance

- **GIVEN** a goal with a documented current value, target, direction, measurement command and source
- **WHEN** a ticket is created for it
- **THEN** the ticket description contains the goal ID, both values, the measurement command and the
  source
