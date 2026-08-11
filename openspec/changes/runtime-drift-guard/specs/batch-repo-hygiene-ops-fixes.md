## ADDED Requirements

### Requirement: Runtime drift detection for replaced MCP server binaries

The system SHALL detect MCP server processes that execute a binary which has since been
replaced on disk, and SHALL report each such process without terminating it.

A process holds its executable through an open inode handle. Replacing the file on disk
leaves the running process on the old code, which makes a merged fix ineffective while the
repository shows it as present. Terminating the process is an operator decision, so the
check reports and names the remedy instead of acting.

The set of binaries to check SHALL be derived from the existing registry
`docs/agent-guide/registry/mcp.yaml` — every entry with `transport: stdio` — so that a newly
registered server is covered without maintaining a second list.

#### Scenario: Process runs a deleted binary

- **GIVEN** an MCP server process whose `/proc/<pid>/exe` symlink resolves to a path ending
  in `" (deleted)"`
- **WHEN** the drift check runs
- **THEN** it reports that process with its PID, start time and the registry entry it
  belongs to
- **AND** it exits with status 1
- **AND** the process is still running afterwards

#### Scenario: Process binary differs from the file on disk

- **GIVEN** an MCP server process whose executable is readable and not marked deleted, but
  whose checksum differs from the file the registry points at
- **WHEN** the drift check runs
- **THEN** it reports both checksums for that process
- **AND** it exits with status 1

#### Scenario: All processes run the current binary

- **GIVEN** every registered stdio MCP server process executes the binary currently on disk
- **WHEN** the drift check runs
- **THEN** it reports no drift for the process checker
- **AND** it exits with status 0

### Requirement: Runtime drift detection for unapplied database migrations

The system SHALL detect database functions whose installed definition lacks the evidence
marker declared by the migration that is supposed to have produced it.

Comparing full source text against `pg_proc.prosrc` is unreliable because `CREATE OR REPLACE`
normalizes the stored text. Each migration therefore declares its own evidence marker, and
the marker lives in the migration file so that writing a new migration makes it checkable
without touching a second file.

A migration declares its marker as a comment line of the form:

```sql
-- RUNTIME-CHECK: function=<schema>.<function> marker=<substring>
```

#### Scenario: Migration declared but not applied

- **GIVEN** a migration file under `scripts/one-shot/` declaring a `RUNTIME-CHECK` marker
- **AND** the installed function's `prosrc` does not contain that marker
- **WHEN** the drift check runs
- **THEN** it reports the function, the expected marker and the migration file that supplies
  it
- **AND** it exits with status 1

#### Scenario: Migration applied

- **GIVEN** a migration file declaring a `RUNTIME-CHECK` marker
- **AND** the installed function's `prosrc` contains that marker
- **WHEN** the drift check runs
- **THEN** it reports no drift for that function

#### Scenario: Database unreachable

- **GIVEN** the database cannot be reached
- **WHEN** the drift check runs
- **THEN** it reports the database checker as skipped, stating that it could not connect
- **AND** it does not report a drift for any function
- **AND** the skip alone does not cause a non-zero exit status

A guard that turns red without a cluster measures the environment rather than the state of
the system, so an unreachable database is reported as unknown, never as drift.

### Requirement: Drift check never modifies system state

The drift check SHALL be read-only. It SHALL NOT terminate processes, apply migrations,
write to the database, or modify files.

#### Scenario: Check runs against a drifted system

- **GIVEN** a system with both a replaced binary and an unapplied migration
- **WHEN** the drift check runs
- **THEN** the offending process is still running afterwards
- **AND** the installed function definition is unchanged
- **AND** the reported output names the command that would remedy each finding

### Requirement: repo-hygiene reports runtime drift

The `repo-hygiene` skill SHALL run the drift check as part of its repository inspection and
surface its findings alongside the existing branch, worktree and queue findings.

#### Scenario: Hygiene run surfaces drift

- **GIVEN** a runtime drift is present
- **WHEN** the `repo-hygiene` skill inspects the repository
- **THEN** the drift appears in its findings with the remedy command
