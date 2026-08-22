## MODIFIED Requirements

### Requirement: Mishap rollup generates compliant change per run

The mishap rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL produce a plan-only change
under `openspec/changes/` on a per-cycle branch named after the cycle slug
(`mishap-incident-rollup-<suffix>`), and that change SHALL pass OpenSpec validation. The generator
SHALL create the change artifacts itself: a `.ticket` file containing the container ticket ID and
a `specs/<slug>.md` delta that lists the bundle's findings as `ADDED Requirements`. The bundle has
no parent SSOT spec. After merge, the finalizer SHALL archive such cycle slugs with `--no-merge`,
so the process-note delta is moved into the change archive without creating or modifying an SSOT
spec. Other change slugs SHALL retain the regular delta-merge archive behavior.

#### Scenario: Change directory passes openspec validation

- **GIVEN** the rollup generator runs with fresh batch comments on the container ticket
- **WHEN** the resulting change directory under `openspec/changes/mishap-incident-rollup-<suffix>/`
  is committed
- **THEN** the OpenSpec validation tests SHALL pass
- **AND** `.ticket` SHALL exist with the container ticket ID
- **AND** `specs/` SHALL exist with a delta file named after the cycle slug

#### Scenario: Mishap rollup uses the no-merge archive path

- **GIVEN** a merged change whose slug starts with `mishap-incident-rollup-`
- **WHEN** the post-merge finalizer archives the change
- **THEN** it SHALL pass `--no-merge` to the OpenSpec archive command
- **AND** it SHALL NOT create a standalone SSOT component for the cycle

#### Scenario: A regular change retains delta merging

- **GIVEN** a merged change whose slug does not start with `mishap-incident-rollup-`
- **WHEN** the post-merge finalizer archives the change
- **THEN** it SHALL invoke the regular OpenSpec archive path without `--no-merge`

### Requirement: Unresolved entries SHALL carry over into the next container

Before producing a cycle plan, the rollup generator SHALL collect the unresolved
entry tasks of every unarchived finished rollup cycle and append them to the
current container as regular batches. The transfer SHALL name each source
cycle, SHALL be idempotent per source cycle and container, and SHALL run before
the batch count is taken.

The scan SHALL consider all unarchived cycle directories whose checkbox-based
plan is published in the scan repository's current `HEAD`; this committed-HEAD
membership is the offline finished-cycle signal. It SHALL ignore cycles already
below `openspec/changes/archive/`, untracked or branch-local plans, and the cycle
belonging to the current container. When a newer source plan contains an entry
already present in an older source plan, the entry SHALL be emitted only for
the oldest source, using its normalized title and metadata as identity. Plans
from before checkbox-based disposition tracking are not reconstructed implicitly.
A failed transfer SHALL NOT abort the rollup run: the source plan stays in place
and the next run retries.

#### Scenario: Multiple unarchived cycles are transferred

- **GIVEN** two unarchived finished cycles that both hold unresolved checkbox entry tasks
- **WHEN** the transfer candidates are scanned
- **THEN** both cycles SHALL be reported in cycle-date order

#### Scenario: Archived cycles are not transferred again

- **GIVEN** an archived cycle and an unarchived cycle with unresolved entry tasks
- **WHEN** the transfer candidates are scanned
- **THEN** only the unarchived cycle SHALL be reported

#### Scenario: Transitive entries are emitted once

- **GIVEN** cycle B contains an unresolved entry already present in older cycle A
- **WHEN** both cycles are transferred in cycle-date order
- **THEN** that entry SHALL be emitted from A only

#### Scenario: An unpublished cycle is not finished

- **GIVEN** an untracked cycle plan exists beside a cycle plan committed in `HEAD`
- **WHEN** the transfer candidates are scanned
- **THEN** only the plan committed in `HEAD` SHALL be reported

#### Scenario: The current cycle and resolved cycles are excluded

- **GIVEN** a cycle belonging to the current container and a cycle whose entry tasks are all resolved
- **WHEN** the transfer candidates are scanned
- **THEN** neither cycle SHALL be reported
