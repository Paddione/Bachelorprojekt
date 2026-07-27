## ADDED Requirements

### Requirement: Every claimed provider slot is released on all return paths

Any script that obtains a slot from `scripts/factory/route-provider.sh` SHALL release it again on
**every** return path, including error paths. A claim increments
`tickets.provider_health.active_agents`; a provider whose counter reaches `max_concurrent` is
silently skipped by the candidate chain, without any error being surfaced to the caller.

Scripts that claim more than once per run SHALL NOT rely on an `EXIT` trap alone, because such a
trap releases only the final claim.

#### Scenario: The triage helper releases its slot after a successful call

- **GIVEN** `auto-triage.sh` has routed a ticket and holds a slot for provider `deepseek`
- **WHEN** the LLM call completes successfully
- **THEN** `active_agents` for `deepseek` is back at its pre-call value

#### Scenario: The triage helper releases its slot after a failed call

- **GIVEN** `auto-triage.sh` holds a slot and the downstream `curl` fails
- **WHEN** the helper returns a non-zero status
- **THEN** the slot is released just as on the success path

#### Scenario: A provider at its concurrency cap is skipped, not reported

- **GIVEN** `tickets.provider_health.active_agents` for a provider equals its `max_concurrent`
- **WHEN** `route-provider.sh` walks the candidate chain
- **THEN** that provider is passed over and the next candidate is claimed instead

### Requirement: Orphaned provider slots are reclaimed after a TTL

`tickets.provider_health` SHALL record `claimed_at` for every active claim, and
`scripts/factory/reap-provider-slots.sh` SHALL release claims older than
`PROVIDER_SLOT_TTL_MIN` (default 30). The TTL SHALL stay well above the runtime of a single LLM
request — a shorter value would release slots of requests still in flight and thereby defeat the
concurrency limit it is meant to protect.

#### Scenario: A stale claim is reclaimed

- **GIVEN** a provider row with `active_agents` above zero and `claimed_at` older than the TTL
- **WHEN** the reaper runs
- **THEN** `active_agents` is decremented and `claimed_at` is reset to `NULL`

#### Scenario: A fresh claim is left alone

- **GIVEN** a provider row whose `claimed_at` lies within the TTL
- **WHEN** the reaper runs
- **THEN** the row is left untouched

#### Scenario: Releasing one of several concurrent claims keeps the timestamp

- **GIVEN** a provider holds more than one concurrent claim
- **WHEN** `release-slot.sh` releases one of them
- **THEN** `claimed_at` is retained, so the reaper can still see the remaining claim

### Requirement: Provider names are free of structural characters

`tickets.provider_health.provider` SHALL reject values containing a backslash, tab or any other
whitespace. Such values indicate a failed field split, where an entire result row was written as a
single provider name.

#### Scenario: A malformed provider name is rejected

- **GIVEN** an insert whose provider value contains an escaped tab sequence
- **WHEN** the row is written to `tickets.provider_health`
- **THEN** the database rejects it via a CHECK constraint

### Requirement: Tests never write to production routing tables or the working tree

Test suites SHALL NOT write to `tickets.provider_config`, `tickets.provider_health` or the repository
working tree. Argument-validation tests SHALL use a dry-run mode that stops before any database
access, and shell tests that change directory SHALL fail loudly if the change fails — bats does not
set `set -e` inside `@test` blocks, so an unguarded `cd` lets subsequent commands run against the
real repository root.

#### Scenario: Validation is tested without touching the database

- **GIVEN** a test asserting that `provider-config.sh set` accepts `tier=opus` with a warning
- **WHEN** the test invokes the script with `--dry-run`
- **THEN** the warning is emitted and no row is written to `tickets.provider_config`

#### Scenario: A failed directory change aborts the test

- **GIVEN** a test that changes into a temporary repository before creating files
- **WHEN** the directory change fails
- **THEN** the test returns non-zero instead of creating those files in the repository root
