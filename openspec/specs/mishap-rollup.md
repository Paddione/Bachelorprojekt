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

### Requirement: Rollup container resolution is brand-agnostic

The rollup container resolution (`scripts/ticket.sh rollup-container`) SHALL resolve and create
the rollup container without any brand predicate. The `--brand` option SHALL either be removed
or accepted-and-ignored with a deprecation note, and container creation SHALL pin a documented
constant brand (`ROLLUP_CONTAINER_BRAND`). The function header SHALL state that the rollup lane
is deliberately cross-brand.

#### Scenario: Generator adopts the open container regardless of invoking brand

- **GIVEN** an open rollup container exists with `brand='korczewski'`
- **WHEN** the generator runs without any brand context
- **THEN** resolution returns that container's `external_id`
- **AND** no new container is created

#### Scenario: Container creation uses the pinned constant brand

- **GIVEN** no open rollup container exists in collect mode
- **WHEN** `scripts/ticket.sh rollup-container` creates a new one
- **THEN** the created ticket carries the brand from `ROLLUP_CONTAINER_BRAND`, independent of
  any ambient `BRAND` environment value

### Requirement: Mishap-rollup generator runs once per tick

The factory tick (`scripts/factory/wakeup.sh`) SHALL invoke `scripts/factory/mishap-rollup.sh`
exactly once per tick, not once per brand. The mishap buffer flush step immediately before it
SHALL remain per-brand.

#### Scenario: Single generator invocation per tick

- **GIVEN** a factory tick reaches the mishap-rollup driver section
- **WHEN** wakeup.sh executes the rollup generation steps
- **THEN** `mishap-rollup.sh` runs exactly once
- **AND** the preceding `--flush-stale-mishaps` invocations still run once per brand

### Requirement: Rollup tickets carry consistent brand across read paths

For a given ticket row, all ticket read interfaces (`get_ticket` and the timeline export) SHALL
report the same `brand` value as stored in the database.

#### Scenario: Timeline export matches get_ticket on brand

- **GIVEN** ticket T013107 with `brand='korczewski'` in `tickets.tickets`
- **WHEN** both `get_ticket` and the timeline export are queried without explicit brand
- **THEN** both report `korczewski`

<!-- merged from change delta mishap-rollup.md (f84329c25b0d) -->

### Requirement: Generator tags recurring entries across cycles

The rollup generator SHALL search all historical batch comments on mishap-rollup container
tickets (including closed ones) for entries with the same component and equal/similar title,
and SHALL render a recurrence marker (`×N`) plus references to the prior cycles in the entry
header of the generated plan. A first-time occurrence renders without marker.

#### Scenario: Second occurrence of an already-batched failure

- **GIVEN** batch 08-20 contained entry "SCS post-commit Reindex schlägt fehl (embed
  localhost:8081 unerreichbar)" and a new buffer flush produces the same component/title again
- **WHEN** the generator renders the new plan
- **THEN** the entry header carries `×2` and links to the 08-20 cycle comment
- **AND** a first-time entry renders without any recurrence marker

### Requirement: Watchlist disposition keeps entries alive until expiry

The plan template SHALL accept a fourth entry disposition, `beobachten (bis Zyklus <N>)`,
alongside `gefixt`, `bereits gefixt` and `kein Repo-Fix`. The generator SHALL re-include every
live watchlist entry from prior plans into each newly generated batch, until the named cycle is
reached or the entry is explicitly closed.

#### Scenario: Watchlist entry resurfaces automatically

- **GIVEN** cycle 2026-08-19 dispositioned entry "gemma12-vision MTP draft crashes" as
  `beobachten (bis Zyklus 3)`
- **WHEN** any later cycle before that boundary generates its plan
- **THEN** the MTP entry appears in the batch again, marked as watchlist carryover with its
  origin cycle referenced

#### Scenario: Expired watchlist entry escalates instead of resurfacing

- **GIVEN** a watchlist entry whose boundary cycle has passed
- **WHEN** the next generator run executes
- **THEN** the entry is NOT silently included in the batch again
- **AND** it is escalated per the escalation requirement below

### Requirement: Stalled entries escalate out of the rollup loop

The generator SHALL promote an entry into its own standalone ticket (`needs_human`) when either
the entry has been carried over unresolved for at least 2 consecutive cycles or its watchlist
boundary cycle has expired. The promoted ticket SHALL reference the originating cycles, and the
entry SHALL leave the rollup loop.

#### Scenario: Twice-carried entry becomes its own ticket

- **GIVEN** an entry was unchecked in two consecutive cycle plans and carried over both times
- **WHEN** the generator prepares the third cycle's plan
- **THEN** a standalone ticket is created with the entry's full description and cycle history
- **AND** the entry no longer appears in subsequent batches

### Requirement: Completed rollup cycles are archived by the machine

The factory tick (or the rollup generator before batch rendering) SHALL run an archive janitor
that detects completed rollup cycles — a cycle whose container ticket is `done` or `archived`
while its change directory still sits under `openspec/changes/` — and moves each such directory
to `openspec/changes/archive/<cycle-date>-<slug>`. Archival SHALL no longer depend on a session
manually running `devflow-post-merge-finalize.sh`.

#### Scenario: Unarchived cycle from a rescued executor run

- **GIVEN** cycle `mishap-incident-rollup-2026-08-19-T012445` with its container ticket
  `done/fixed` and its change directory still under `openspec/changes/`
- **WHEN** the archive janitor runs
- **THEN** the directory is moved to `openspec/changes/archive/2026-08-19-mishap-incident-rollup-2026-08-19-T012445`
  in one commit on the janitor's own branch

#### Scenario: Active cycle is never archived

- **GIVEN** cycle `mishap-incident-rollup-2026-08-22-T013107` with its container ticket still
  `plan_staged`
- **WHEN** the archive janitor runs
- **THEN** that cycle's directory remains untouched

<!-- merged from change delta mishap-rollup.md (762662dfc1f2) -->

<!-- merged from change delta mishap-rollup.md (ea9ea6e7d176) -->

### Requirement: Rollup generator SHALL coalesce batches before staging

Der Generator soll Container nicht mehr bei jedem Lauf mit Einträgen stagten, sondern sie im
Collect Mode sammeln lassen, bis genug Einträge zusammen sind oder der älteste Eintrag alt
genug ist. Das verhindert die Container-Flut (18 Container in 40 Minuten am 2026-08-22) und
hält einen Factory-Run pro Zyklus statt einem pro Einzel-Eintrag.

The rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL stage the container's plan only
when the batch has reached `ROLLUP_MIN_ENTRIES` entries (default 3) OR the oldest batch entry is
at least `ROLLUP_MAX_AGE_H` hours old (default 24). Both thresholds SHALL be overridable via
environment variables. Below both thresholds the generator SHALL exit 0 without creating a
worktree and without calling stage-plan, leaving the container in Collect Mode so that flush and
carry-over reuse the same container.

#### Scenario: Container below threshold stays in Collect Mode

- **GIVEN** a Collect-Mode container whose batch has fewer than `ROLLUP_MIN_ENTRIES` entries and
  whose oldest entry is younger than `ROLLUP_MAX_AGE_H` hours
- **WHEN** the rollup generator runs
- **THEN** it SHALL emit a no-op message and exit 0
- **AND** it SHALL NOT create a worktree
- **AND** it SHALL NOT call stage-plan

#### Scenario: Threshold reached stages the plan

- **GIVEN** a Collect-Mode container whose batch has at least `ROLLUP_MIN_ENTRIES` entries
- **WHEN** the rollup generator runs
- **THEN** it SHALL proceed with the existing staging path (worktree, plan generation, stage-plan)

#### Scenario: Age fallback stages a small batch

- **GIVEN** a Collect-Mode container whose batch has fewer than `ROLLUP_MIN_ENTRIES` entries but
  whose oldest entry is at least `ROLLUP_MAX_AGE_H` hours old
- **WHEN** the rollup generator runs
- **THEN** it SHALL proceed with the existing staging path (worktree, plan generation, stage-plan)

#### Scenario: Thresholds are overridable via environment

- **GIVEN** the environment variables `ROLLUP_MIN_ENTRIES` and `ROLLUP_MAX_AGE_H` are set
- **WHEN** the rollup generator evaluates the coalescing gate
- **THEN** the generator SHALL use the environment values instead of the defaults 3 and 24

<!-- merged from change delta mishap-rollup.md (40950185810c) -->