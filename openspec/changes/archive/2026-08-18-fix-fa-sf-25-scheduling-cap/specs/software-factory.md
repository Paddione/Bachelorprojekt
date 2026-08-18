## ADDED Requirements

### Requirement: FA-SF-25-Tests deterministisch auf geteilter Dev-DB

The FA-SF-25 schedule tests (`tests/spec/software-factory/scheduling.bats`) SHALL
run deterministically against the shared dev DB even when foreign tickets occupy
slots or foreign backlog candidates are queued. They SHALL NOT assume the
precondition of a "clean dev DB".

The test caps SHALL be derived from the live slot baseline instead of hardcoded
values: `base_used` mirrors the `global_used` calculation of `schedule.sh` (sum of
the `slots.sh count` values of both brands), and
`FACTORY_GLOBAL_CAP`/`FACTORY_SLOTS_PER_BRAND` are raised by the headroom the
test needs. The tests SHALL run a bounded retry (fresh baseline measurement and
seed reset per attempt) so slot claims of foreign sessions between measurement
and run cannot exhaust the headroom. The plan JSON SHALL be extracted from the
last line of the script output, since BATS merges stderr warnings of foreign
candidates into `$output` before the final plan line. Test seeds SHALL be ranked
deterministically ahead of foreign candidates (`priority='hoch'`,
`created_at='2000-01-01'`) so they receive the headroom slots; the global-cap
test SHALL assert by positive anchor that the single planned entry is the own
seed.

#### Scenario: Foreign occupied slots do not exhaust the test cap

- **GIVEN** the shared dev DB has foreign `in_progress` tickets with `pipeline_slot` set
- **WHEN** the FA-SF-25 "two disjoint backlog features" test seeds two features and runs `schedule.sh` with the baseline-derived cap
- **THEN** both seeded features receive a slot in the plan
- **AND** the test asserts on the last output line, ignoring stderr warnings

#### Scenario: Global cap of one schedules the own seed only

- **GIVEN** the shared dev DB has foreign backlog candidates in the queue
- **WHEN** the FA-SF-25 "global cap of 1" test seeds two features and runs `schedule.sh` with headroom 1
- **THEN** exactly the first-ranked own seed is planned
- **AND** the test asserts `length == 1` with the own seed's `external_id` as positive anchor
