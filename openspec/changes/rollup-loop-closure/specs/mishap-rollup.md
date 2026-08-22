## ADDED Requirements

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
