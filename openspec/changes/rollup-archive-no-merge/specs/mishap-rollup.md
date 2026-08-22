## MODIFIED Requirements

### Requirement: Rollup bundle SHALL be archived without creating an SSOT component

The generated mishap rollup bundle SHALL remain a process note rather than a
standalone SSOT component. After merge, the finalizer SHALL archive a change
whose slug starts with `mishap-incident-rollup-` by invoking the OpenSpec
archive path with `--no-merge`. Other change slugs SHALL retain the regular
delta-merge archive behavior.

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

The scan SHALL consider all unarchived cycle directories with checkbox-based
open entries. It SHALL ignore cycles already below `openspec/changes/archive/`
and SHALL exclude the cycle belonging to the current container. Plans from
before checkbox-based disposition tracking are not reconstructed implicitly.
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

#### Scenario: The current cycle and resolved cycles are excluded

- **GIVEN** a cycle belonging to the current container and a cycle whose entry tasks are all resolved
- **WHEN** the transfer candidates are scanned
- **THEN** neither cycle SHALL be reported
