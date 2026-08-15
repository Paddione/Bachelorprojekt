## ADDED Requirements

### Requirement: Blocker-gate WARN assertions are line-scoped

The blocker-gate guard tests SHALL assert the hold-WARN by matching the specific
`open blockers:` line and the blocker id within that line, not by unqualified greps over the
full command output — a positive match on the plan JSON or an unrelated future WARN must
never satisfy the assertion (T002448-M4 output-verification convention). The pool-busy
pre-check SHALL treat a non-numeric `slots.sh count` result as busy (fail-closed skip)
instead of silently proceeding against a possibly occupied pool.

#### Scenario: hold-WARN assertion matches the WARN line only

- **GIVEN** the hardening guard runs against a schedule.sh output where the candidate was
  held with a WARN
- **WHEN** the WARN assertion is evaluated
- **THEN** it matches the `open blockers:` line and the blocker id within that line — and
  fails when the WARN line is absent even if the blocker id appears elsewhere in the output

#### Scenario: pool-busy pre-check fails closed on a broken count

- **GIVEN** `slots.sh count` produces no numeric value (error output)
- **WHEN** the guard's pool-busy pre-check runs
- **THEN** the test skips instead of proceeding against an unknown pool state
