## ADDED Requirements

### Requirement: plan-meta set merges the readiness JSONB instead of replacing it
<!-- bats: ticket-system.bats -->

The system SHALL merge `--readiness` key/value pairs into the existing `readiness` JSONB using
`readiness = COALESCE(readiness,'{}'::jsonb) || COALESCE(<new>, '{}'::jsonb)`, so that keys not
named in the call survive the update. The inner `COALESCE` SHALL guard the case where
`--readiness` is omitted — the generated fragment is then the literal `NULL`, and an unguarded
`jsonb || NULL` would blank the column instead of leaving it untouched. The system SHALL NOT offer
a replacing write path; merging is the only semantics.

This makes the shell path agree with the merge semantics already required of the TypeScript path
in `planning-office.md` ("The system SHALL perform a JSONB merge … when `readinessUpdates` is
non-empty") and with the five other readiness writers in the repository.

#### Scenario: A second flag does not evict the first *(BATS)*
- **GIVEN** `scripts/ticket.sh` is inspected for the `plan-meta set` UPDATE statement
- **WHEN** the readiness assignment is checked
- **THEN** it reads `readiness = COALESCE(readiness,'{}'::jsonb) || COALESCE(` — the merge form, so
  that `--readiness a=true` followed by `--readiness b=true` leaves both keys present

#### Scenario: The replacing form is gone, not merely shadowed *(BATS)*
- **GIVEN** `scripts/ticket.sh` is inspected for the `plan-meta set` UPDATE statement
- **WHEN** the file is searched for the old assignment `readiness = COALESCE($readiness_sql, readiness)`
- **THEN** no such line exists anywhere in the file

#### Scenario: Omitting --readiness leaves the column untouched *(BATS)*
- **GIVEN** `plan-meta set` is called without `--readiness`, so the generated fragment is the
  literal `NULL`
- **WHEN** the readiness assignment is checked
- **THEN** the new value is wrapped in `COALESCE(…, '{}'::jsonb)`, making the merge a no-op rather
  than blanking the column

#### Scenario: Control-flag keys survive an unrelated readiness write *(BATS)*
- **GIVEN** the merge form is in place
- **WHEN** a caller sets a Definition-of-Readiness flag such as `spec_skizziert`
- **THEN** the dispatch-control keys `lastenheft_locked`, `factory_excluded` and
  `execution_released` are not part of the written object and therefore survive

---

### Requirement: A read-only report lists tickets whose readiness was likely truncated
<!-- bats: ticket-system.bats -->

The system SHALL provide a read-only `readiness-audit` subcommand under `scripts/vda/ticket/` that
lists tickets suspected of having lost readiness keys, and SHALL NOT write to the database — the
lost keys are not reconstructable, only the candidate list is. The subcommand SHALL be reachable
through the existing `scripts/vda/ticket.sh` dispatcher.

The report SHALL apply two heuristics: tickets whose `readiness` holds exactly one key although
their status has advanced beyond `triage`, and tickets with a non-empty `requirements_list` whose
`readiness` lacks the `lastenheft_locked` key entirely (as opposed to holding it with value
`false`, which records a deliberate unlock).

#### Scenario: The audit subcommand exists and is dispatchable *(BATS)*
- **GIVEN** the repository tree
- **WHEN** `scripts/vda/ticket/readiness-audit.sh` and the `scripts/vda/ticket.sh` dispatcher are
  inspected
- **THEN** the module exists and the dispatcher routes `readiness-audit` to it

#### Scenario: The audit performs no writes *(BATS)*
- **GIVEN** `scripts/vda/ticket/readiness-audit.sh`
- **WHEN** the file is searched for mutating SQL keywords (`UPDATE`, `INSERT`, `DELETE`)
- **THEN** none are present

#### Scenario: The lock heuristic distinguishes a missing key from a false value *(BATS)*
- **GIVEN** `scripts/vda/ticket/readiness-audit.sh`
- **WHEN** the lock-suspicion query is inspected
- **THEN** it tests for key absence (`NOT ... ? 'lastenheft_locked'`) rather than for a falsy
  value, so a deliberate unlock is not reported as damage
