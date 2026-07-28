## ADDED Requirements

### Requirement: stage-plan Derives touched_files From the Plan

The system SHALL derive `tickets.tickets.touched_files` from the plan's `## File Structure`
section when a plan is staged, rather than relying on a later manual step. The derivation SHALL
be additive: an existing `touched_files` value SHALL be extended, never replaced, so that files
recorded during implementation survive a re-stage.

Rationale: `## File Structure` is a plan-lint hard rule (STRUCT1), so the information is
guaranteed to exist at stage time. Setting the column only in `dev-flow-execute` step 1.5 — and
there only conditionally ("if the plan knows the touched files") — makes conflict detection
depend on an agent performing an optional prose step.

#### Scenario: Staging a plan populates touched_files

- **GIVEN** a plan whose `## File Structure` section lists `scripts/foo.sh` and `tests/bar.bats`
- **WHEN** the plan is staged for a ticket whose `touched_files` is `NULL`
- **THEN** `touched_files` contains both paths

#### Scenario: Re-staging does not discard files added during implementation

- **GIVEN** a ticket whose `touched_files` already contains `scripts/extra.sh`, a file the
  implementer touched but which the plan never listed
- **WHEN** the same plan is staged again
- **THEN** `touched_files` still contains `scripts/extra.sh` alongside the plan's paths

#### Scenario: A plan without derivable paths does not block staging

- **GIVEN** a plan whose `## File Structure` section names no repository path
- **WHEN** the plan is staged
- **THEN** staging succeeds
- **AND** the absence is reported on stderr rather than passing silently

### Requirement: File Structure Parsing Covers the Three Established Formats

The system SHALL extract repository paths from a `## File Structure` section written in any of
the three formats in use: a fenced block with `NEW:`/`CHANGED:` group headers, a bullet list with
backtick-quoted paths, or a Markdown table with backtick-quoted paths. A candidate SHALL be
accepted only if it is tracked in the repository or carries a known file extension; descriptive
prose, group headers, and table column headings SHALL NOT be emitted as paths.

Rationale: of 33 plans carrying the section, 23 use the fenced form and the remainder split
between bullet and table form. Entries are not always repository paths — one plan lists a
Kubernetes resource in a namespace under this heading.

#### Scenario: Fenced form with group headers

- **GIVEN** a `## File Structure` fence containing a `NEW:` header and an indented line
  `scripts/foo.sh — adds the deriver`
- **WHEN** paths are extracted
- **THEN** `scripts/foo.sh` is emitted
- **AND** neither `NEW:` nor the description after the dash is emitted

#### Scenario: Bullet and table forms with backtick-quoted paths

- **GIVEN** a section containing the bullet ``- `tests/spec/database.bats` (modified)`` and a
  table row `` | `k3d/brett.yaml` | Add comment | ``
- **WHEN** paths are extracted
- **THEN** both `tests/spec/database.bats` and `k3d/brett.yaml` are emitted
- **AND** the table column heading is not emitted

#### Scenario: Non-path entries are rejected while real paths beside them survive

- **GIVEN** a section listing both `tests/spec/database.bats` and the cluster resource
  `deployment/arena-server in namespace workspace-korczewski`
- **WHEN** paths are extracted
- **THEN** `tests/spec/database.bats` is emitted
- **AND** `deployment/arena-server` is not emitted, because it is neither tracked in the
  repository nor carries a file extension
