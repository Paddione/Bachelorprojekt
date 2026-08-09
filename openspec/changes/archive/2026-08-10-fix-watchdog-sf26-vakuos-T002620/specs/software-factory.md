## ADDED Requirements

### Requirement: Watchdog live tests SHALL age tickets via the staleness threshold, not updated_at backdating

The trigger `tickets.fn_lifecycle_ts` unconditionally overwrites
`NEW.updated_at := now()` on every UPDATE, so a test that backdates `updated_at` to
fabricate a stale ticket never ages the row: the watchdog then runs against an empty
stale list and the escalation path — status reset, slot release, audit comment,
worktree cleanup, attempt counter — is not exercised. A test whose setup relies on
backdating therefore cannot distinguish a working watchdog from a broken one.

Live watchdog tests SHALL fabricate staleness by running `watchdog.sh` with
`FACTORY_STALE_MIN=0` — every `in_progress` ticket is immediately due — instead of
manipulating `updated_at`. Each such test SHALL assert a positive anchor, the seeded
`external_id` present in the emitted JSON array, so a run whose stale list is empty
cannot pass. Live tests SHALL set the ticket state (`pipeline_slot`, `status`) via a
direct UPDATE rather than `slots.sh claim`, because `claim` writes the
`pipeline_slot_meta` column that is missing in production (T002619).

#### Scenario: Stale test fabricates staleness through the threshold

- **GIVEN** a live test seeds an `in_progress` feature with `pipeline_slot` set and does not backdate `updated_at`
- **WHEN** `watchdog.sh` runs for that brand with `FACTORY_STALE_MIN=0`
- **THEN** the emitted JSON array contains the seeded `external_id`
- **AND** the ticket's status is reset and its `pipeline_slot` released

#### Scenario: An empty stale list fails the positive anchor

- **GIVEN** `watchdog.sh` runs for that brand and its stale list is empty
- **WHEN** the test asserts the seeded `external_id` appears in the JSON array
- **THEN** the assertion fails — exit 0 with an empty array must not satisfy the test
