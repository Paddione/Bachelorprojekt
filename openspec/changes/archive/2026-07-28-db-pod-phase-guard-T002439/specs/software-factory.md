## ADDED Requirements

### Requirement: Pod-Phase Guard Is Match-Granular and Covers Tests

The system SHALL enforce that every `shared-db` pod selection in the repository carries
`--field-selector status.phase=Running`, evaluated **per logical line** rather than per file.
A logical line is the result of joining backslash continuations. The guard SHALL scan both
`scripts/` and `tests/` and SHALL include `*.sh` and `*.bats` files. A selection that is
deliberately unfiltered SHALL carry an explicit opt-out marker on the same logical line;
without that marker the guard SHALL report it.

Rationale: an unfiltered selection can return a `Completed` or `Terminating` pod, after which
`kubectl exec` fails with exit code 1. A file-granular guard passes any file that mentions the
filter anywhere — including a file that only mentions it inside the guard's own search pattern.

#### Scenario: An unfiltered selection in a test file is reported

- **GIVEN** a file under `tests/` contains a `shared-db` pod selection without
  `--field-selector status.phase=Running` and without an opt-out marker
- **WHEN** the guard runs
- **THEN** the guard fails and names that file

#### Scenario: A filter elsewhere in the same file does not excuse an unfiltered selection

- **GIVEN** a file contains one selection carrying `--field-selector status.phase=Running`
  and a second selection on a different logical line carrying no filter and no opt-out marker
- **WHEN** the guard runs
- **THEN** the guard fails, because the presence of a filter on one line does not cover the other

#### Scenario: A selection split across lines by a backslash continuation counts as filtered

- **GIVEN** a selection whose `--field-selector status.phase=Running` sits on the continuation
  line after a trailing backslash
- **WHEN** the guard runs
- **THEN** the guard treats the joined logical line as filtered and does not report it

#### Scenario: A deliberately unfiltered selection is tolerated only with its marker

- **GIVEN** the error path in `scripts/vda/ticket/_ticket-core.sh` queries pods unfiltered to
  distinguish "no pod at all" from "pods exist, none Running", and carries the opt-out marker
- **WHEN** the guard runs
- **THEN** the guard does not report that line
- **AND** removing the marker makes the guard report it

### Requirement: Database-Dependent Tests Skip on Absent Running Pod

The system SHALL make test helpers that require a live `shared-db` connection skip when no
**Running** pod is reachable, not merely when no pod object is found. A helper that finds a
non-Running pod SHALL skip rather than proceed into a `kubectl exec` that exits non-zero.

#### Scenario: Only a non-Running pod exists

- **GIVEN** the namespace contains a `shared-db` pod in phase `Succeeded` and none in `Running`
- **WHEN** a database-dependent test invokes its skip helper
- **THEN** the test is skipped
- **AND** the test run does not report a failure or a non-zero exit code from `kubectl exec`

### Requirement: touched_files Distinguishes Unscouted from Empty

The system SHALL keep `tickets.tickets.touched_files` nullable without a default. `NULL` SHALL
mean "no scout has recorded files for this ticket"; an empty array SHALL mean "scout ran and
found no files". Conflict detection SHALL rely on this distinction.

Rationale: a `NOT NULL DEFAULT '{}'` migration would make both states indistinguishable and
silently turn every unscouted ticket into a participant in conflict detection.

#### Scenario: Conflict detection ignores unscouted tickets

- **GIVEN** a ticket whose `touched_files` is `NULL`
- **WHEN** `conflict-check.sh` searches for colliding in-flight tickets
- **THEN** that ticket is excluded from the comparison by the `touched_files IS NOT NULL` filter
