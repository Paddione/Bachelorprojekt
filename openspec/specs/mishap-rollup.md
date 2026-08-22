# mishap-rollup

## Purpose

Nicht-kritische Reibungen aus dev-flow- und Runbook-Läufen sollen weder einzeln den Ticket-Backlog
fluten noch stillschweigend verfallen. Der Rollup-Container ist der Sammelpunkt dazwischen: der
Buffer-Flusher hängt Batches an ihn, der Generator macht daraus periodisch einen Plan, die Factory
arbeitet ihn ab, und der Merge schließt den Container.

Der Spec regelt drei Dinge, an denen dieser Weg nachweislich gerissen ist: dass pro Zyklus genau
ein validierbarer Change entsteht, dass der Container ephemer ist und von der Factory geschlossen
wird statt vom Generator, und dass ein Eintrag ohne Disposition beim Schließen nicht verloren geht,
sondern in den Folge-Container wandert.

## Requirements

### Requirement: Mishap rollup generates compliant change per run

The mishap rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL produce a plan-only change
under `openspec/changes/` on a per-cycle branch named after the cycle slug
(`mishap-incident-rollup-<suffix>`), and that change SHALL pass OpenSpec validation. The generator
SHALL create the change artifacts itself: a `.ticket` file containing the container ticket ID and
a `specs/<slug>.md` delta that lists the bundle's findings as `ADDED Requirements` — the bundle
has no parent SSOT spec and is archived with `--no-merge`.

#### Scenario: Change directory passes openspec validation

- **GIVEN** the rollup generator runs with fresh batch comments on the container ticket
- **WHEN** the resulting change directory under `openspec/changes/mishap-incident-rollup-<suffix>/`
  is committed
- **THEN** the OpenSpec validation tests SHALL pass
- **AND** `.ticket` SHALL exist with the container ticket ID
- **AND** `specs/` SHALL exist with a delta file named after the cycle slug

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

### Requirement: Rollup container SHALL be ephemeral

The rollup container ticket SHALL NOT stay open permanently. The buffer flusher SHALL append to
the single open container (oldest first). Once the generator has produced the cycle plan from the
container's batches, the generator SHALL stage that plan onto the container
(`stage-plan --no-hold`), which moves it to `plan_staged` together with its plan reference; the
factory staged lane dispatches it, the executor implements the fixes, and the post-merge finalizer
closes the container by merge-is-closure (`done`, `resolution=fixed`). The generator SHALL NOT
close the container itself.

At most one container SHALL be in collect mode at a time, and a container in collect mode SHALL be
found regardless of its workflow status. A dispatched container leaves collect mode; the next
flush creates a fresh container.

#### Scenario: An open blocked container is found and reused

- **GIVEN** an open rollup container ticket in status `blocked`
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL print that container's `external_id` on stdout
- **AND** it SHALL NOT create a new container ticket

#### Scenario: Generator stages the plan onto the container

- **GIVEN** an open rollup container whose batch comments were turned into a generated plan
- **WHEN** the generator finishes publishing the plan
- **THEN** the container SHALL be staged with its plan reference and reach `plan_staged`
- **AND** the generator SHALL NOT set the container to `done`

#### Scenario: Closure follows the merge, not the generator

- **GIVEN** a staged rollup container whose cycle pull request has been merged to `main`
- **WHEN** the post-merge finalizer runs
- **THEN** the container SHALL be `done` with `resolution=fixed`
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

<!-- merged from change delta mishap-rollup.md (4eb4ef052908) -->

### Requirement: Container description SHALL not claim permanence

The rollup container ticket created by `scripts/ticket.sh rollup-container` SHALL NOT describe
itself as permanently open. Its description SHALL state the ephemeral lifecycle: the container
collects one batch and is closed (`done · resolution=fixed`) after the generator has consumed
it.

#### Scenario: Fresh container description states the ephemeral lifecycle

- **GIVEN** no open rollup container exists
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` creates a new container
- **THEN** the ticket description SHALL NOT contain a claim of permanent openness
- **AND** the description SHALL mention that the container is closed after its batch is processed

<!-- merged from change delta mishap-rollup.md (53e97241fe44) -->

### Requirement: Container resolution SHALL be verifiable against the live database

The container-resolution behavior of `scripts/ticket.sh rollup-container` SHALL be
covered by a regression test that runs against the real ticket database (not kubectl
mocks), so that the predicate emitted by the search (`status NOT IN ('done','archived')`)
and the single-open-container invariant are pinned on the actual execution path. The test
SHALL skip cleanly when no cluster is reachable or the production invariant ("exactly one
open container") is violated.

#### Scenario: Real-DB test verifies the resolution predicate and the no-duplicate invariant

- **GIVEN** a reachable cluster with a ticket database holding exactly one open rollup container
- **WHEN** `tests/spec/mishap-rollup/container-resolution-real-db.bats` runs
- **THEN** `rollup-container` SHALL return that container's `external_id` without creating a duplicate
- **AND** the SQL emitted by the search SHALL contain `status NOT IN ('done','archived')` and SHALL NOT contain a positive `status IN (` allowlist

#### Scenario: Real-DB test skips when the cluster is unreachable

- **GIVEN** no reachable cluster (e.g. CI without a live database)
- **WHEN** the real-DB test runs
- **THEN** it SHALL skip (not fail) with an explicit skip reason

<!-- merged from change delta mishap-rollup.md (2f05c3ae7783) -->

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

<!-- merged from change delta mishap-rollup.md (fd3fe4e3f412) -->

### Requirement: Unresolved entries SHALL carry over into the next container

Before producing a cycle plan, the rollup generator SHALL collect the unresolved entry tasks of
finished rollup cycles and append them to the current container as a regular batch, so that
entries which received no disposition do not expire together with their container. The transfer
SHALL name its source cycle, SHALL be idempotent per source cycle and container, and SHALL run
before the batch count is taken, so that carried-over entries are planned in the same run.

The scan SHALL consider every unarchived finished cycle with checkbox-based open entries. It
SHALL ignore cycles already below `openspec/changes/archive/`. Plans from before checkbox-based
disposition tracking are not reconstructed implicitly.

The cycle belonging to the current container SHALL be excluded from the scan, and a failed
transfer SHALL NOT abort the rollup run: the source plan stays in place and the next run retries.

#### Scenario: An unresolved entry survives its container

- **GIVEN** a finished rollup cycle whose plan still holds an unresolved entry task
- **AND** a current rollup container that has not yet received that cycle's transfer
- **WHEN** the rollup generator runs
- **THEN** a batch containing that entry SHALL be appended to the current container
- **AND** the batch SHALL name the source cycle
- **AND** the entry SHALL be counted towards the current cycle's batch count

#### Scenario: The same cycle is never transferred twice

- **GIVEN** a container that already carries a transfer from a given source cycle
- **WHEN** the rollup generator runs again
- **THEN** no second transfer of that cycle SHALL be appended

#### Scenario: All unarchived finished cycles are transferred

- **GIVEN** two finished cycles that both hold unresolved entry tasks
- **WHEN** the transfer candidates are scanned
- **THEN** both cycles SHALL be reported in cycle-date order

#### Scenario: A resolved cycle produces no transfer

- **GIVEN** a finished cycle whose entry tasks all carry a disposition
- **WHEN** the transfer candidates are scanned
- **THEN** that cycle SHALL NOT be reported

<!-- merged from change delta mishap-rollup.md (ce960d7d9aac) -->
