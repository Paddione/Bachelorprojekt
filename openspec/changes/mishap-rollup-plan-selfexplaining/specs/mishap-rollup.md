## ADDED Requirements

### Requirement: Rollup plan SHALL carry one checkable task per mishap entry

The rollup plan generator SHALL render one open checkbox task per mishap entry contained in the
container's batch comments, instead of a fixed set of generic tasks. Each entry task SHALL name
the entry's title and SHALL require a disposition — the executor states what happened to that
entry (fixed / already fixed / no repo fix, with a reason). The number of entry tasks SHALL follow
the number of entries, not the number of comments.

#### Scenario: Two entries produce two entry tasks

- **GIVEN** a container batch comment listing two mishap entries
- **WHEN** the rollup plan tasks section is rendered
- **THEN** the output SHALL contain one open checkbox per entry
- **AND** each of those checkboxes SHALL name its entry's title
- **AND** each of those checkboxes SHALL require a disposition

### Requirement: Rollup plan SHALL state how the container is worked off

The rendered tasks section SHALL contain an explicit working instruction naming the three
admissible dispositions (fixed, already fixed, no repo fix), so that a model with no prior context
can work the container off from the plan alone.

#### Scenario: The rendered block names the admissible dispositions

- **GIVEN** a container batch comment with at least one mishap entry
- **WHEN** the tasks section is rendered
- **THEN** the output SHALL name each of the three admissible dispositions

### Requirement: Only real mishap batches SHALL count as container batches

The generator SHALL treat only comments produced by the buffer flusher (comment bodies starting
with the batch header `### Mishap-Rollup`) as batches. Watchdog notes, `Unfactored` notes and
executor comments SHALL neither count towards the batch count nor appear in the generated plan.
A container whose only comments are such notes SHALL be treated as having no batches, so that no
empty cycle is started.

#### Scenario: Watchdog notes do not become tasks

- **GIVEN** a comment stream containing one mishap batch comment and several watchdog notes
- **WHEN** the tasks section is rendered
- **THEN** no task SHALL be derived from the watchdog notes

#### Scenario: A container with only watchdog notes counts zero batches

- **GIVEN** a comment stream that contains no `### Mishap-Rollup` batch comment
- **WHEN** the batch count is requested
- **THEN** the count SHALL be `0`
