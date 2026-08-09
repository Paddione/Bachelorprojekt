## ADDED Requirements

### Requirement: The fleet ticket-id sequence occupies a separate number range

While the fleet copy of `tickets.tickets` remains writable, its
`tickets.external_id_seq` SHALL sit in a number range disjoint from the local database's,
starting at 900000. `migrate-tickets.sh split-sequence` SHALL establish that state.

Both databases assign `external_id` through the same BEFORE-INSERT trigger, each drawing
from its own sequence. Overlapping ranges therefore hand out the same T-number twice —
observed in T002731. The permission-based fix (freeze) is unavailable until T002722
resolves the shared use of `tickets.tickets` by the customer portal.

#### Scenario: Establishing the split on a fleet sequence below the boundary

- **GIVEN** fleet's `tickets.external_id_seq` reads below 900000
- **WHEN** `bash scripts/sdlc/migrate-tickets.sh split-sequence` runs
- **THEN** the command exits 0
- **AND** the next `external_id` fleet assigns matches `^T9[0-9]{5}$`
- **AND** the command reports the previous and the new value

#### Scenario: Running the command when the split already holds

- **GIVEN** fleet's sequence already reads at or above 900000
- **WHEN** the command runs again
- **THEN** it exits 0 and leaves the sequence untouched
- **AND** it reports that no change was needed

#### Scenario: A dump-and-restore cycle reverts the sequence

- **GIVEN** a fleet dump taken before the split is restored
- **WHEN** `migrate-tickets.sh restore` completes
- **THEN** the split is re-established before the command returns
- **AND** the restore output states that it did so

### Requirement: The status command surfaces the sequence split

`migrate-tickets.sh status` SHALL report both databases' `external_id_seq` values and
SHALL state explicitly whether the split currently holds.

A silently reverted split is indistinguishable from a healthy one until the next
collision. Naming the state is what makes the regression visible.

#### Scenario: Reading status while the split holds

- **WHEN** `bash scripts/sdlc/migrate-tickets.sh status` runs
- **THEN** its output contains both sequence values
- **AND** it states that the split is in effect

#### Scenario: Reading status after the split was lost

- **GIVEN** fleet's sequence reads below 900000
- **WHEN** the status command runs
- **THEN** its output names the split as absent and points at `split-sequence`
