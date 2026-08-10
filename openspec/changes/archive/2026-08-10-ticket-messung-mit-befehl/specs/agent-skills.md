## ADDED Requirements

### Requirement: A measurement used as a decision basis in a ticket carries its command

`CLAUDE.md` MUST document a convention requiring that any measurement written into a ticket as
justification for a decision — in particular a decision to defer or to not do something — is
accompanied by the executable command that produced it. The convention MUST state that naming the
match mode, the date or the excluded directories alone is insufficient: the search pattern (and
therefore the runnable command) is the part that determines the result and MUST be recorded.

The convention MUST be marked explicitly as an editorial rule without an automated runtime guard,
consistent with the existing M10 deliverable-check convention, and MUST name the reason: whether a
number is reproducible cannot be decided by a machine at ticket-write time, because verifying it
requires the repository state at the moment of measurement.

#### Scenario: The convention is present in the root instruction file

- **GIVEN** the repository root file `CLAUDE.md`
- **WHEN** its content is inspected
- **THEN** it contains a section that obliges the author of a ticket-borne measurement to record the
  command that produced it
- **AND** that section carries the ticket reference `T002717`
- **AND** that section states that it is an editorial convention rather than an automated guard

#### Scenario: The convention names the pattern as the decisive omission

- **GIVEN** the section described above
- **WHEN** its content is inspected
- **THEN** it makes clear that documenting date, match mode or exclusion filters without the search
  pattern does not make a measurement reproducible

#### Scenario: The guard fails when the convention is removed

- **GIVEN** a copy of `CLAUDE.md` from which the section has been deleted
- **WHEN** the documentation-convention test runs against that copy
- **THEN** the test fails

### Requirement: The measurement-convention guard verifies its own subject exists

The BATS guard for the measurement convention MUST contain a positive anchor in the same test: it
MUST first assert that `CLAUDE.md` exists and is non-empty before asserting the presence of the
convention text. A guard that only searches for a string would pass vacuously if the file were
missing or unreadable.

#### Scenario: Positive anchor precedes the content assertion

- **GIVEN** the test file for the measurement convention
- **WHEN** it runs against a missing or empty `CLAUDE.md`
- **THEN** it fails on the anchor assertion rather than reporting a passing search
