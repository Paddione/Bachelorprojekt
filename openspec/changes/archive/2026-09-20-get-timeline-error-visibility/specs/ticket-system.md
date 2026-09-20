## ADDED Requirements

### Requirement: `_exec_sql` reports the real cause of a failed SQL call instead of aborting silently

`_exec_sql` (`scripts/vda/ticket/_ticket-core.sh`) SHALL keep running past a
failing `kubectl exec`/`psql` invocation under `set -euo pipefail` for long
enough to print the captured stderr and preserve the non-zero exit code, so a
caller (e.g. `ticket.sh get-timeline`) can never observe an empty
stdout+stderr pair with a non-zero exit as if it were a valid empty result.

#### Scenario: a SQL error under `set -e` still reaches stderr

- **GIVEN** a caller sources `_ticket-core.sh` under `set -euo pipefail` (the
  same option state `scripts/ticket.sh` runs under) and calls `_exec_sql`
  with a query that psql rejects (e.g. `ON_ERROR_STOP` triggers on an
  unknown column)
- **WHEN** the underlying `kubectl exec ... psql ...` call fails
- **THEN** the process's combined output contains the psql error text, and
  the exit status is non-zero

#### Scenario: a successful query is unaffected

- **GIVEN** the same `set -euo pipefail` caller
- **WHEN** `_exec_sql` runs a query that succeeds
- **THEN** execution continues normally past the `_exec_sql` call (no
  premature abort) and the exit status is 0
