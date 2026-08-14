# Delta: Terminal-Guard-Reparatur für ungültiges done

## MODIFIED Requirements

### Requirement: update-status.sh uses heredoc and guards terminal transitions

`scripts/vda/ticket/update-status.sh` SHALL read the current status via heredoc SQL
(not `-c` flag) to avoid shell-quoting/port-forward issues. After reading, it SHALL enforce
that terminal tickets (`done`, `archived`) can only transition to `archived` — any other
transition SHALL exit 2 with a clear error message. Idempotent transitions
(`done→done`, `archived→archived`) SHALL be allowed.

Repair exemption (T003072): a `done` state that was never valid — `resolution IS NULL` AND
`created_at = updated_at` (no lifecycle) — is machine-verifiably distinguishable from a
legitimate closure and SHALL NOT block the transition. The script SHALL emit a visible WARN
naming the invalid done state and proceed with the requested non-terminal transition.
`archived` SHALL remain hard (no exemption). The mirrored TS write path
(`website/src/lib/tickets/transition.ts`) SHALL apply the same exemption so that both write
paths agree (T002230 pattern).

#### Scenario: A caller tries to transition from a legitimate done to in_progress

- **GIVEN** a ticket in status `done` with `resolution = 'fixed'` or `created_at < updated_at`
- **WHEN** `update-status.sh done in_progress` is called
- **THEN** the script exits 2 with "Cannot transition from 'done' to 'in_progress'"
- **AND** the database row is NOT modified

#### Scenario: A caller transitions from done to archived

- **GIVEN** a ticket in status `done` with `resolution = 'shipped'`
- **WHEN** `update-status.sh done archived` is called
- **THEN** the UPDATE runs and sets status to `archived`
- **AND** the resolution is preserved

#### Scenario: A caller repairs an invalid done state via update-status.sh

- **GIVEN** a ticket in status `done` with `resolution IS NULL` and `created_at = updated_at`
- **WHEN** `update-status.sh done in_progress` is called
- **THEN** the script emits a WARN naming the invalid done state
- **AND** the UPDATE runs and sets status to `in_progress`

#### Scenario: The TS write path mirrors the repair exemption

- **GIVEN** a ticket in status `done` with `resolution IS NULL` and `created_at = updated_at`
- **WHEN** `transitionTicket` is called with a non-terminal status
- **THEN** the transition succeeds without throwing the terminal-guard error
- **AND** a legitimately closed ticket (resolution set or lifecycle present) still throws
