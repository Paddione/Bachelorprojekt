## ADDED Requirements

### Requirement: Unresolved entries SHALL carry over into the next container

Before producing a cycle plan, the rollup generator SHALL collect the unresolved entry tasks of
finished rollup cycles and append them to the current container as a regular batch, so that
entries which received no disposition do not expire together with their container. The transfer
SHALL name its source cycle, SHALL be idempotent per source cycle and container, and SHALL run
before the batch count is taken, so that carried-over entries are planned in the same run.

The scan SHALL consider only the most recent finished cycle. That cycle's plan already contains
the transfers of all older cycles — they were appended to its container and rendered into its
plan — so transferring every candidate would deliver the same entry twice after two consecutive
cycles that resolved nothing.

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

#### Scenario: Only the most recent finished cycle is transferred

- **GIVEN** two finished cycles that both hold unresolved entry tasks
- **WHEN** the transfer candidates are scanned
- **THEN** only the cycle with the most recent cycle date SHALL be reported

#### Scenario: A resolved cycle produces no transfer

- **GIVEN** a finished cycle whose entry tasks all carry a disposition
- **WHEN** the transfer candidates are scanned
- **THEN** that cycle SHALL NOT be reported

## MODIFIED Requirements

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
