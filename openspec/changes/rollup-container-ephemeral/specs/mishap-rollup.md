## MODIFIED Requirements

### Requirement: rollup-container self-heals on an empty search result

`scripts/ticket.sh rollup-container` SHALL create a new rollup container ticket (Step 2) when its
search for an existing open container (Step 1) returns an empty result set, instead of aborting
under `set -euo pipefail` before reaching the create path.

#### Scenario: Empty search result still reaches the create path

- **GIVEN** no ticket matches `type='chore' AND title='Mishap Rollup — fortlaufende Sammlung' AND
  status NOT IN ('done','archived')`
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL exit 0, emit the diagnostic
  "kein offener Container, lege neuen an" on stderr, and print the newly created ticket's
  `external_id` on stdout — the search pipeline's `grep -v` returning exit 1 on empty input SHALL
  NOT abort the function under `pipefail`.

### Requirement: Mishap rollup generates compliant change per run

The mishap rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL produce a plan-only change
under `openspec/changes/` on a per-cycle branch named after the cycle slug
(`mishap-incident-rollup-<suffix>`), and that change SHALL pass OpenSpec validation.

#### Scenario: Change directory passes openspec validation

- **GIVEN** the rollup generator runs with fresh batch comments on the container ticket
- **WHEN** the resulting change directory under `openspec/changes/mishap-incident-rollup-<suffix>/`
  is committed
- **THEN** the OpenSpec validation tests SHALL pass
- **AND** `specs/` SHALL exist with at least one delta file

## REMOVED Requirements

### Requirement: Rollup branch advances instead of accumulating generator commits

Obsolet: Mit dem ephemeren Zyklus-Branch gibt es keinen Generator-Commit, der ersetzt werden
müsste — jeder Zyklus committet genau einmal auf seinen eigenen Branch.

### Requirement: Generator never rewrites foreign commits

Obsolet: Ohne Amend-/Force-Push-Mechanik kann der Generator keine Fremd-Commits mehr
überschreiben.

## ADDED Requirements

### Requirement: Rollup container SHALL be ephemeral

The rollup container ticket SHALL no longer stay open permanently. The buffer flusher SHALL
append to the single open container (oldest first); once the generator has produced the cycle
plan from the container's batches, the generator SHALL close the container with
`done` and `resolution=obsolete`. At most one open container SHALL exist at a time, and an open
container SHALL be found regardless of its workflow status.

#### Scenario: An open blocked container is found and reused

- **GIVEN** an open rollup container ticket in status `blocked`
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL print that container's `external_id` on stdout
- **AND** it SHALL NOT create a new container ticket

#### Scenario: Generator closes the container after consuming its batches

- **GIVEN** an open rollup container whose batch comments were turned into a generated plan
- **WHEN** the generator finishes publishing the plan
- **THEN** the container ticket SHALL be `done` with `resolution=obsolete`
- **AND** the next flush SHALL create a fresh container

### Requirement: Rollup change SHALL merge to main per cycle

The rollup generator SHALL publish each cycle on its own branch (`chore/<cycle-slug>`) with a
plain push — no amend, no force-with-lease. The cycle change SHALL be merged to `main` and
archived under `openspec/changes/archive/`, after which the cycle branch and its worktree SHALL
be removed.

#### Scenario: Cycle branch is published once and archived on main

- **GIVEN** a rollup cycle whose plan has been generated on branch `chore/<cycle-slug>`
- **WHEN** the cycle plan is merged to `main`
- **THEN** the change SHALL be archived under `openspec/changes/archive/`
- **AND** the cycle branch SHALL be deleted afterwards
- **AND** no force-push SHALL have occurred during the cycle
