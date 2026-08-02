## ADDED Requirements

### Requirement: Dependency-based partial scheduling without full-gang claim

The factory scheduler SHALL start a ticket whose plan has N partials as soon as at least one
slot is free and at least one partial has no unmet dependencies, claiming
`min(ready partials, free slots)` slots (minimum 1) instead of requiring an all-or-nothing
claim of N slots. Head-of-line blocking SHALL only apply when zero slots are free.

#### Scenario: Single agent starts a multi-partial ticket

- **GIVEN** a `plan_staged` ticket with 3 partials of which at least one has no dependencies,
  and exactly 1 free slot in the brand pool
- **WHEN** the scheduler runs
- **THEN** the ticket is claimed with 1 slot and execution begins with a dependency-free
  partial instead of waiting for 3 free slots

### Requirement: Optional depends_on column in the partials manifest

The `## Partials` manifest table SHALL accept an optional fifth column `depends_on`
(comma-separated partial ids). `plan-lint.sh` SHALL hard-fail on references to unknown partial
ids and on dependency cycles, and SHALL continue to accept four-column manifests (no
dependencies). The pipeline SHALL execute partials in a topological order, only starting
partials whose dependencies have completed, and on resume SHALL skip partials already recorded
as done via `partial-done` phase events.

#### Scenario: Cycle in depends_on is rejected

- **GIVEN** a partials manifest where p1 depends on p2 and p2 depends on p1
- **WHEN** `plan-lint.sh` runs on the plan index
- **THEN** it exits non-zero with a hard error naming the cycle

#### Scenario: Resume skips completed partials

- **GIVEN** a ticket whose `partial-done` events record p1 as completed
- **WHEN** the pipeline resumes the ticket
- **THEN** p1 is not re-executed and the next ready partial starts

### Requirement: Partial count scales with plan size

`stage-plan --partials` SHALL accept values from 1 to 9. Plans MAY declare more than three
partials when their file sets are genuinely disjoint; the decompose guidance expresses a rule
of thumb (one partial per disjoint subsystem, tests separate) instead of a hard cap of three.

#### Scenario: Staging a five-partial plan

- **GIVEN** a plan index whose manifest declares five disjoint partials
- **WHEN** the plan is staged with `--partials 5`
- **THEN** staging succeeds and the ticket's slot_count is 5
