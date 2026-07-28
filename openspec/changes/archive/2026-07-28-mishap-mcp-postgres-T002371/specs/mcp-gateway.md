## ADDED Requirements

### Requirement: verify-ticket-id.sh guards writes with a second-source read

A new script `scripts/verify-ticket-id.sh` SHALL verify that a given `external_id` exists as
a row in `tickets.tickets` using a `kubectl exec … psql` call (safe path — no port-forward)
before the caller proceeds with a write that depends on that ID. The script SHALL exit 0 when
the ticket exists, exit 1 when it does not (caller aborts write), and exit 2 on infrastructure
error (no pod found).

#### Scenario: Writes are gated behind a read-integrity guard

- **GIVEN** a write depends on an `external_id` that was read through `mcp__mcp-postgres__query`
  (port-forward path)
- **WHEN** the caller runs `scripts/verify-ticket-id.sh <external_id> [brand]` before the write
- **THEN** the script checks the DB via `kubectl exec…psql` and exits 0 only if the ticket
  actually exists
- **AND** the caller aborts the write if the script exits non-zero

### Requirement: mcp-tool-guide.md documents the verify-ticket-id.sh guard

The Port-Forward-Integrität section in `.claude/skills/references/mcp-tool-guide.md` SHALL
reference `scripts/verify-ticket-id.sh` by name and argument signature as the concrete
tool for the "Gegenprüfung" rule.

#### Scenario: A skill author needs to add the Gegenprüfung pattern

- **GIVEN** the reader is at the Port-Forward-Integrität section of `mcp-tool-guide.md`
- **WHEN** they reach the "Ein Read, dessen Ergebnis eine Schreiboperation steuert" rule
- **THEN** they see `scripts/verify-ticket-id.sh <external_id> [brand]` as the concrete
  invocation, with its exit-code contract documented

### Requirement: ticket-attach.sh filters on Running pods

`scripts/ticket-attach.sh` SHALL filter its `kubectl get pod` call with
`--field-selector status.phase=Running` so that a completed pod (from a prior rollout,
node drain, or eviction) does not sort before the live pod and cause `kubectl exec` /
`kubectl cp` to fail with "cannot exec into a container in a completed pod".

#### Scenario: A completed shared-db pod is present next to the live one

- **GIVEN** a Succeeded `shared-db-<old-revision>` pod and a Running `shared-db-<current>` pod
  in namespace `workspace`
- **WHEN** `scripts/ticket-attach.sh` resolves the pod with `kubectl get pod -l app=shared-db`
- **THEN** only the Running pod is returned (`--field-selector status.phase=Running`)
- **AND** `kubectl cp` and `kubectl exec` succeed against the live pod

### Requirement: update-status.sh uses heredoc and guards terminal transitions

`scripts/vda/ticket/update-status.sh` SHALL read the current status via heredoc SQL
(not `-c` flag) to avoid shell-quoting/port-forward issues. After reading, it SHALL enforce
that terminal tickets (`done`, `archived`) can only transition to `archived` — any other
transition SHALL exit 2 with a clear error message. Idempotent transitions
(`done→done`, `archived→archived`) SHALL be allowed.

#### Scenario: A caller tries to transition from done to in_progress

- **GIVEN** a ticket in status `done`
- **WHEN** `update-status.sh done in_progress` is called
- **THEN** the script exits 2 with "Cannot transition from 'done' to 'in_progress'"
- **AND** the database row is NOT modified

#### Scenario: A caller transitions from done to archived

- **GIVEN** a ticket in status `done` with `resolution = 'shipped'`
- **WHEN** `update-status.sh done archived` is called
- **THEN** the UPDATE runs and sets status to `archived`
- **AND** the resolution is preserved
